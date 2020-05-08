/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats')()
const base32 = require('multiformats/bases/base32')
const { fromHashHex } = require('bitcoin-block')
const bitcoin = require('../src/bitcoin')
const bitcoinTx = require('../src/bitcoin-tx')
const fixtures = require('./fixtures')

const CODEC_TX_CODE = 0xb1
// the begining of a dbl-sha2-256 multihash, prepend to hash or txid
const MULTIHASH_DBLSHA2256_LEAD = '5620'

function blockDataToHeader (data) {
  const header = Object.assign({}, data)
  // chain-context data that can't be derived
  'confirmations chainwork height mediantime nextblockhash'.split(' ').forEach((p) => delete header[p])
  // data that can't be derived without transactions
  'tx nTx size strippedsize weight'.split(' ').forEach((p) => delete header[p])
  return header
}

function txHashToCid (hash) {
  return new multiformats.CID(1, CODEC_TX_CODE, Buffer.from(`${MULTIHASH_DBLSHA2256_LEAD}${hash}`, 'hex'))
}

describe('bitcoin', () => {
  multiformats.multibase.add(base32)
  multiformats.add(bitcoin)

  const blocks = {}

  before(async () => {
    for (const name of fixtures.names) {
      blocks[name] = await fixtures(name)
      blocks[name].expectedHeader = blockDataToHeader(blocks[name].data)
      blocks[name].expectedHeader.parent = new multiformats.CID(blocks[name].meta.parentCid)
      blocks[name].expectedHeader.tx = new multiformats.CID(blocks[name].meta.txCid)
      if (blocks[name].data.tx[0].txid !== blocks[name].data.tx[0].hash) {
        // is segwit transaction, add default txinwitness, see
        // https://github.com/bitcoin/bitcoin/pull/18826 for why this is missing
        blocks[name].data.tx[0].vin[0].txinwitness = [''.padStart(64, '0')]
      }
    }
  })

  describe('header', () => {
    test('decode block, header only', async () => {
      const decoded = await multiformats.decode(blocks.block.raw.slice(0, 80), 'bitcoin-block')
      assert.deepEqual(decoded, blocks.block.expectedHeader, 'decoded header correctly')
    })

    for (const name of fixtures.names) {
      test(`decode "${name}", full raw`, async () => {
        const decoded = await multiformats.decode(blocks[name].raw, 'bitcoin-block')
        assert.deepEqual(decoded, blocks[name].expectedHeader, 'decoded header correctly')
      })

      test(`encode "${name}"`, async () => {
        const encoded = await multiformats.encode(blocks[name].expectedHeader, 'bitcoin-block')
        assert.strictEqual(encoded.toString('hex'), blocks[name].raw.slice(0, 80).toString('hex'), 'raw bytes match')
      })
    }
  })

  describe('merkle', () => {
    for (const name of fixtures.names) {
      test(`encode "${name}" transactions into merkle`, async () => {
        let index = 0
        let lastCid
        for await (const { cid, binary } of bitcoinTx.encodeAllNoWitness(multiformats, blocks[name].data.tx)) {
          if (index < blocks[name].data.tx.length) {
            // one of the base transactions
            const [hashExpected, txidExpected, start, end] = blocks[name].meta.tx[index]
            let expectedCid
            if (!txidExpected) {
              // not segwit, encoded block should be identical
              assert.strictEqual(binary.length, end - start, 'got expected block length')
              expectedCid = txHashToCid(hashExpected)
            } else {
              assert(binary.length < end - start - 2, `got approximate expected block length (${binary.length}, ${end - start}`)
              expectedCid = txHashToCid(txidExpected)
            }
            assert.deepEqual(cid, expectedCid)
          }
          // console.log('merkle cid', cid)
          index++
          lastCid = cid
        }
        assert.deepEqual(lastCid, blocks[name].expectedHeader.tx, 'got expected merkle root')
      })
    }
  })

  describe('transactions', () => {
    for (const name of fixtures.names) {
      test(`decode and encode "${name}" transactions`, async () => {
        for (let ii = 0; ii < blocks[name].meta.tx.length; ii++) {
          // known metadata of the transaction, its hash, txid and byte location in the block
          const [hashExpected, txidExpected, start, end] = blocks[name].meta.tx[ii]
          const txExpected = blocks[name].data.tx[ii]

          // manually ammend expected to include vin links (CIDs) to previous transactions
          for (const vin of txExpected.vin) {
            if (vin.txid) {
              // this value comes out of the json, so it's already a BE hash string, we need to reverse it
              vin.tx = txHashToCid(fromHashHex(vin.txid).toString('hex'))
            }
          }

          // decode
          const txRaw = blocks[name].raw.slice(start, end)
          const decoded = await multiformats.decode(txRaw, 'bitcoin-tx')
          assert.deepEqual(decoded, txExpected, 'decoded matches')

          // encode
          const encoded = await multiformats.encode(txExpected, 'bitcoin-tx')
          assert.strictEqual(encoded.toString('hex'), txRaw.toString('hex'), 'encoded raw bytes match')

          // generate CID from bytes, compare to known hash
          const hash = await multiformats.multihash.hash(encoded, 'dbl-sha2-256')
          const cid = new multiformats.CID(1, CODEC_TX_CODE, hash)
          const expectedCid = txHashToCid(hashExpected)
          assert.strictEqual(cid.toString(), expectedCid.toString(), 'got expected CID from bytes')

          if (txidExpected) {
            // is a segwit transaction, check we can encode it without witness data properly
            // by comparing to known txid (hash with no witness)
            const encodedNoWitness = bitcoinTx.encodeNoWitness(txExpected) // go directly because this isn't a registered stand-alone coded
            const hashNoWitness = await multiformats.multihash.hash(encodedNoWitness, 'dbl-sha2-256')
            const cidNoWitness = new multiformats.CID(1, CODEC_TX_CODE, hashNoWitness)
            const expectedCidNoWitness = txHashToCid(txidExpected)
            assert.strictEqual(cidNoWitness.toString(), expectedCidNoWitness.toString(), 'got expected CID from no-witness bytes')
          } else {
            // is not a segwit transaction, check that segwit encoding is identical to standard encoding
            const encodedNoWitness = bitcoinTx.encodeNoWitness(txExpected) // go directly because this isn't a registered stand-alone coded
            assert.strictEqual(encodedNoWitness.toString('hex'), encoded.toString('hex'), 'encodes the same with or without witness data')
          }
        }
      })
    }
  })
})
