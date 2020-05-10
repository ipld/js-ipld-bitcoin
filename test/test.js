/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats')()
const base32 = require('multiformats/bases/base32')
const { fromHashHex } = require('bitcoin-block')
const bitcoin = require('../src/bitcoin')
const bitcoinTx = require('../src/bitcoin-tx')
const bitcoinWitnessCommitment = require('../src/bitcoin-witness-commitment')
const fixtures = require('./fixtures')

const CODEC_TX_CODE = 0xb1
const CODEC_WITNESS_COMMITMENT_CODE = 0xb2
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

function witnessCommitmentHashToCid (hash) {
  return new multiformats.CID(1, CODEC_WITNESS_COMMITMENT_CODE, Buffer.from(`${MULTIHASH_DBLSHA2256_LEAD}${hash}`, 'hex'))
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
      for (const tx of blocks[name].data.tx) {
        // manually ammend expected to include vin links (CIDs) to previous transactions
        for (const vin of tx.vin) {
          if (vin.txid) {
            // this value comes out of the json, so it's already a BE hash string, we need to reverse it
            vin.tx = txHashToCid(fromHashHex(vin.txid).toString('hex'))
          }
        }
      }
    }
  })

  describe('header', () => {
    test('decode block, header only', async () => {
      const decoded = await multiformats.decode(blocks.block.raw.slice(0, 80), 'bitcoin-block')
      assert.deepEqual(decoded, blocks.block.expectedHeader, 'decoded header correctly')
    })

    for (const name of fixtures.names) {
      describe(`block "${name}"`, () => {
        test('decode full raw', async () => {
          const decoded = await multiformats.decode(blocks[name].raw, 'bitcoin-block')
          assert.deepEqual(decoded, blocks[name].expectedHeader, 'decoded header correctly')
        })

        test('encode', async () => {
          const encoded = await multiformats.encode(blocks[name].expectedHeader, 'bitcoin-block')
          assert.strictEqual(encoded.toString('hex'), blocks[name].raw.slice(0, 80).toString('hex'), 'raw bytes match')
        })
      })
    }
  })

  async function verifyMerkle (name, witness) {
    // how many nodes of this merkle do we expect to see?
    let expectedNodes = blocks[name].data.tx.length
    let last = expectedNodes
    while (last > 1) {
      last = Math.ceil(last / 2)
      expectedNodes += last
    }

    let index = 0
    let lastCid
    let lastLayer
    let thisLayer = []
    let thisLayerLength = blocks[name].data.tx.length
    let layer = 0
    if (witness) {
      index = 1 // we skip the coinbase for full merkle
      thisLayer.push(null)
    }

    let witnessCommitment = null
    for await (const { cid, binary } of bitcoinTx[witness ? 'encodeAll' : 'encodeAllNoWitness'](multiformats, blocks[name].data)) {
      assert(Buffer.isBuffer(binary))

      const decoded = await multiformats.decode(binary, 'bitcoin-tx')
      const baseLayer = index < blocks[name].data.tx.length

      if (baseLayer) {
        // one of the base transactions
        const [hashExpected, txidExpected, start, end] = blocks[name].meta.tx[index]
        let expectedCid
        if (index === 0) {
          // if this is a segwit merkle on a segwit block, the coinbase should have a witnessCommitment
          // this will not exist for non-segwit blocks and we won't have index===0 for full-witness
          // merkles (the coinbase is ignored)
          witnessCommitment = decoded.witnessCommitment
        }
        if (witness || !txidExpected) {
          // not segwit, encoded block should be identical
          assert.strictEqual(binary.length, end - start, `got expected block length (${index})`)
          expectedCid = txHashToCid(hashExpected)
          assert.deepEqual(decoded, blocks[name].data.tx[index], 'transaction decoded back into expected form')
        } else {
          assert(binary.length < end - start - 2, `got approximate expected block length (${binary.length}, ${end - start}`)
          expectedCid = txHashToCid(txidExpected)
        }
        assert.deepEqual(cid, expectedCid, 'got expected transaction CID')
      } else {
        // one of the inner or root merkle nodes
        assert.strictEqual(binary.length, 64, 'correct binary form')
        assert(Array.isArray(decoded), 'correct decoded form')
        assert.strictEqual(decoded.length, 2, 'correct decoded form')

        const left = binary.slice(0, 32)
        const right = binary.slice(32)

        // now we do an awkward dance to verify the two nodes in the block were CIDs in the correct position
        // of the previous layer, accounting for duplicates on odd layers
        // debug: process.stdout.write(binary.slice(0, 3).toString('hex') + ',' + binary.slice(32, 32 + 3).toString('hex') + ',')
        let lastLeft = lastLayer[thisLayer.length * 2]
        if (witness && layer === 1 && thisLayer.length === 0) {
          // account for the missing coinbase in non-segwit merkle
          assert.strictEqual(decoded[0], null, 'decoded form coinbase hash left element is correct')
          lastLeft = Buffer.alloc(32)
        } else {
          assert.deepEqual(decoded[0], txHashToCid(left.toString('hex')), 'decoded form left CID is correct')
        }
        assert.deepEqual(decoded[1], txHashToCid(right.toString('hex')), 'decoded form right CID is correct')
        assert.deepEqual(left, lastLeft, `left element in layer ${layer} node is CID in layer ${layer - 1}`)
        // debug: process.stdout.write(`${thisLayer.length} <> ${thisLayer.length * 2} : ${lastLayer.length} : ${thisLayerLength} `)
        // debug: process.stdout.write(`${left.slice(0, 6).toString('hex')} <> ${lastLayer[thisLayer.length * 2].slice(0, 6).toString('hex')} `)
        if (thisLayer.length === thisLayerLength - 1 && lastLayer.length % 2 !== 0) {
          assert.deepEqual(left, right, `last node in layer ${layer} has duplicate left & right`)
          // debug: process.stdout.write(`(dupe) ${right.slice(0, 6).toString('hex')} <> ${left.slice(0, 6).toString('hex')}`)
        } else {
          assert.deepEqual(right, lastLayer[thisLayer.length * 2 + 1], `right element in layer ${layer} node is CID in layer ${layer - 1}`)
          // debug: process.stdout.write(`${right.slice(0, 6).toString('hex')} <> ${lastLayer[thisLayer.length * 2 + 1].slice(0, 6).toString('hex')}`)
        }
        // debug: process.stdout.write('\n')
      }

      thisLayer.push(multiformats.multihash.decode(cid.multihash).digest)

      index++
      lastCid = cid
      if (thisLayer.length === thisLayerLength) {
        thisLayerLength = Math.ceil(thisLayerLength / 2)
        lastLayer = thisLayer
        thisLayer = []
        layer++
      }
    }

    if (!witness) {
      assert.deepEqual(lastCid, blocks[name].expectedHeader.tx, 'got expected merkle root')
    }
    assert.strictEqual(index, expectedNodes, 'got correct number of merkle nodes')

    return { root: lastCid, witnessCommitment }
  }

  // manually find the witness commitment inside the coinbase.
  // it's in _one of_ the vout's, one that's 38 bytes long and starts with a special prefix
  // which we need to strip out to find a 32-byte hash
  function findWitnessCommitment (block) {
    const coinbase = block.tx[0]
    for (const vout of coinbase.vout) {
      const spk = vout.scriptPubKey.hex
      if (spk.length === 38 * 2 && spk.startsWith('6a24aa21a9ed')) {
        return Buffer.from(spk.slice(12), 'hex')
      }
    }
  }

  describe('merkle', () => {
    for (const name of fixtures.names) {
      describe(`block "${name}"`, () => {
        let expectedWitnessCommitment
        before(() => {
          expectedWitnessCommitment = findWitnessCommitment(blocks[name].data)
          if (!expectedWitnessCommitment) {
            // this isn't done inside a test() but it's a sanity check on our fixture data, not the test data
            assert.strictEqual(name, 'block', 'non-segwit block shouldn\'t have witness commitment, all others should')
          }
        })

        test('encode transactions into no-witness merkle', async () => {
          const { witnessCommitment } = await verifyMerkle(name, false)
          if (name === 'block') {
            assert.isUndefined(witnessCommitment, 'no witness commitment for non-witness merkle')
          } else {
            assert(multiformats.CID.isCID(witnessCommitment), 'witness commitment exists and is a CID')
            assert.strictEqual(witnessCommitment.code, 0xb2, 'witness commitment CID is correct')
            const wcmh = multiformats.multihash.decode(witnessCommitment.multihash)
            assert.strictEqual(wcmh.code, 0x56, 'witness commitment CID has correct hash alg')
            assert.deepEqual(wcmh.digest, expectedWitnessCommitment, 'witness commitment CID has correct hash')
          }
        })

        test('encode transactions into segwit merkle & witness commitment', async () => {
          const { root, witnessCommitment } = await verifyMerkle(name, true)

          // witness commitment
          assert.strictEqual(witnessCommitment, null, 'shouldn\'t find a witness commitment in the full-witness merkle')

          if (name === 'block') {
            // nothing else to test here
            return
          }

          const { cid, binary } =
            await bitcoinWitnessCommitment.encodeWitnessCommitment(multiformats, blocks[name].data, root)
          const hash = multiformats.multihash.decode(cid.multihash).digest
          assert.strictEqual(hash.toString('hex'), expectedWitnessCommitment.toString('hex'), 'got expected witness commitment')
          assert.strictEqual(binary.length, 64, 'correct block length')
          // this isn't true for all blocks, just most of them, Bitcoin Core does NULL nonces but it's not a strict
          // requirement so some blocks have novel hashes
          assert.deepEqual(binary.slice(32).toString('hex'), ''.padStart(64, '0'), 'got expected NULL nonce')

          const decoded = multiformats.decode(binary, 'bitcoin-witness-commitment')
          assert.strictEqual(typeof decoded, 'object', 'correct decoded witness commitment form')
          assert(Buffer.isBuffer(decoded.nonce), 'correct decoded witness commitment form')
          assert(multiformats.CID.isCID(decoded.witnessMerkleRoot), 'correct decoded witness commitment form')
        })
      })
    }
  })

  describe('transactions', () => {
    for (const name of fixtures.names) {
      describe(`block "${name}"`, () => {
        // known metadata of the transaction, its hash, txid and byte location in the block
        async function forEachTx (txcb) {
          for (let index = 0; index < blocks[name].meta.tx.length; index++) {
            const [hashExpected, txidExpected, start, end] = blocks[name].meta.tx[index]
            const txExpected = blocks[name].data.tx[index]
            const txRaw = blocks[name].raw.slice(start, end)
            await txcb({ index, hashExpected, txidExpected, start, end, txExpected, txRaw })
          }
        }

        test('decode', async () => {
          return forEachTx(async ({ index, txRaw, txExpected }) => {
            const decoded = await multiformats.decode(txRaw, 'bitcoin-tx')
            if (index === 0 && name !== 'block') { // coinbase for segwit block
              // the coinbase for segwit blocks is decorated with a CID version of the witness commitment
              const expectedWitnessCommitment = findWitnessCommitment(blocks[name].data)
              txExpected.witnessCommitment = witnessCommitmentHashToCid(expectedWitnessCommitment.toString('hex'))
            }
            assert.deepEqual(decoded, txExpected, 'got properly formed transaction')
          })
        })

        test('encode', async () => {
          return forEachTx(async ({ index, txRaw, txExpected, hashExpected, txidExpected }) => {
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
          })
        })
      })
    }
  })
})
