/* eslint-env mocha */

const test = it
const { Buffer } = require('buffer')
const { assert } = require('chai')
const multiformats = require('multiformats')()
const bitcoinTx = require('../src/bitcoin-tx')
const bitcoinWitnessCommitment = require('../src/bitcoin-witness-commitment')
const {
  setupMultiformats,
  setupBlocks,
  txHashToCid,
  findWitnessCommitment,
  fixtureNames,
  toHex
} = require('./util')

describe('merkle', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
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
          expectedCid = txHashToCid(multiformats, hashExpected)
          let actual = decoded
          if (index === 0 && name === '450002') {
            // special case block, faux witness commitment we have to contend with
            assert(decoded.witnessCommitment && decoded.witnessCommitment.buffer && decoded.witnessCommitment.code) // is CID
            actual = Object.assign({}, decoded)
            delete actual.witnessCommitment
          }
          assert.deepEqual(actual, blocks[name].data.tx[index], 'transaction decoded back into expected form')
        } else {
          assert(binary.length < end - start - 2, `got approximate expected block length (${binary.length}, ${end - start}`)
          expectedCid = txHashToCid(multiformats, txidExpected)
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
          assert.deepEqual(decoded[0], txHashToCid(multiformats, toHex(left)), 'decoded form left CID is correct')
        }
        assert.deepEqual(decoded[1], txHashToCid(multiformats, toHex(right)), 'decoded form right CID is correct')
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

  for (const name of fixtureNames) {
    describe(`block "${name}"`, function () {
      this.timeout(10000)

      let expectedWitnessCommitment
      before(() => {
        expectedWitnessCommitment = findWitnessCommitment(blocks[name].data)
        if (!expectedWitnessCommitment) {
          // this isn't done inside a test() but it's a sanity check on our fixture data, not the test data
          assert(!blocks[name].meta.segwit, 'non-segwit block shouldn\'t have witness commitment, all others should')
        }
      })

      test('encode transactions into no-witness merkle', async () => {
        const { witnessCommitment } = await verifyMerkle(name, false)
        if (!blocks[name].meta.segwit && name !== '450002') { // 450002 is the special-case faux segwit
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
        let { root, witnessCommitment } = await verifyMerkle(name, true)

        // witness commitment
        assert.strictEqual(witnessCommitment, null, 'shouldn\'t find a witness commitment in the full-witness merkle')

        if (!blocks[name].meta.segwit) {
          // nothing else to test here
          return
        }

        if (!root) {
          if (blocks[name].data.tx.length === 1) {
            // this is OK, make it null so encodeWitnessCommitment() handles it properly
            root = null
          } else {
            assert.fail('Unexpected missing merkle root')
          }
        }

        const { cid, binary } =
          await bitcoinWitnessCommitment.encodeWitnessCommitment(multiformats, blocks[name].data, root)
        const hash = multiformats.multihash.decode(cid.multihash).digest
        assert.strictEqual(toHex(hash), toHex(expectedWitnessCommitment), 'got expected witness commitment')
        assert.strictEqual(binary.length, 64, 'correct block length')
        // this isn't true for all blocks, just most of them, Bitcoin Core does NULL nonces but it's not a strict
        // requirement so some blocks have novel hashes
        assert.deepEqual(toHex(binary.slice(32)), ''.padStart(64, '0'), 'got expected NULL nonce')

        const decoded = multiformats.decode(binary, 'bitcoin-witness-commitment')
        assert.strictEqual(typeof decoded, 'object', 'correct decoded witness commitment form')
        assert(Buffer.isBuffer(decoded.nonce), 'correct decoded witness commitment form')
        if (blocks[name].data.tx.length === 1) {
          // special case, only a coinbase, no useful merkle root
          assert.strictEqual(decoded.witnessMerkleRoot, null)
        } else {
          assert(multiformats.CID.isCID(decoded.witnessMerkleRoot), 'correct decoded witness commitment form')
        }
      })
    })
  }
})
