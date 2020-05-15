/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats')()
const bitcoinTx = require('../src/bitcoin-tx')
const {
  setupMultiformats,
  setupBlocks,
  witnessCommitmentHashToCid,
  txHashToCid,
  findWitnessCommitment,
  fixtureNames,
  CODEC_TX_CODE,
  toHex
} = require('./util')

describe('transactions', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  for (const name of fixtureNames) {
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
            txExpected.witnessCommitment = witnessCommitmentHashToCid(multiformats, toHex(expectedWitnessCommitment))
          }
          assert.deepEqual(decoded, txExpected, 'got properly formed transaction')
        })
      })

      test('encode', async () => {
        return forEachTx(async ({ index, txRaw, txExpected, hashExpected, txidExpected }) => {
          // encode
          const encoded = await multiformats.encode(txExpected, 'bitcoin-tx')
          assert.strictEqual(toHex(encoded), toHex(txRaw), 'encoded raw bytes match')

          // generate CID from bytes, compare to known hash
          const hash = await multiformats.multihash.hash(encoded, 'dbl-sha2-256')
          const cid = new multiformats.CID(1, CODEC_TX_CODE, hash)
          const expectedCid = txHashToCid(multiformats, hashExpected)
          assert.strictEqual(cid.toString(), expectedCid.toString(), 'got expected CID from bytes')

          if (txidExpected) {
            // is a segwit transaction, check we can encode it without witness data properly
            // by comparing to known txid (hash with no witness)
            const encodedNoWitness = bitcoinTx.encodeNoWitness(txExpected) // go directly because this isn't a registered stand-alone coded
            const hashNoWitness = await multiformats.multihash.hash(encodedNoWitness, 'dbl-sha2-256')
            const cidNoWitness = new multiformats.CID(1, CODEC_TX_CODE, hashNoWitness)
            const expectedCidNoWitness = txHashToCid(multiformats, txidExpected)
            assert.strictEqual(cidNoWitness.toString(), expectedCidNoWitness.toString(), 'got expected CID from no-witness bytes')
          } else {
            // is not a segwit transaction, check that segwit encoding is identical to standard encoding
            const encodedNoWitness = bitcoinTx.encodeNoWitness(txExpected) // go directly because this isn't a registered stand-alone coded
            assert.strictEqual(toHex(encodedNoWitness), toHex(encoded), 'encodes the same with or without witness data')
          }
        })
      })
    })
  }
})
