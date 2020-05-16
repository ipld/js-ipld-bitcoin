/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const fs = require('fs')
const multiformats = require('multiformats')()
multiformats.add(require('@ipld/dag-cbor'))
const CarDatastore = require('datastore-car')(multiformats)
const fixtures = require('./fixtures')
const { setupMultiformats, cleanBlock } = require('./util')
const bitcoin = require('../')

describe('formats', () => {
  before(() => {
    setupMultiformats(multiformats)
  })

  describe('convertBitcoinBinary', () => {
    for (const name of fixtures.names) {
      test(name, async () => {
        let { data: expected, raw } = await fixtures(name)
        expected = cleanBlock(expected)

        const actual = bitcoin.deserializeFullBitcoinBinary(raw)

        // test transactions separately and then header so any failures don't result in
        // chai diff lockups or are just too big to be useful
        for (let i = 0; i < expected.tx.length; i++) {
          assert.deepEqual(actual[i], expected[i], `transaction #${i} successfully converted`)
        }

        const headerActual = Object.assign({}, actual, { tx: null })
        const headerExpected = Object.assign({}, expected, { tx: null })
        assert.deepEqual(headerActual, headerExpected, 'successfully converted from binary')
      })
    }
  })

  describe('convertBitcoinPorcelain', () => {
    for (const name of fixtures.names) {
      test(name, async () => {
        const { data, raw: expected } = await fixtures(name)

        const actual = bitcoin.serializeFullBitcoinBinary(data)
        assert.strictEqual(actual.toString('hex'), expected.toString('hex'), 'got same binary form')
      })
    }
  })

  describe('full block car file round-trip', function () {
    this.timeout(5000)

    for (const name of fixtures.names) {
      test(name, async () => {
        let { data: expected, meta, raw } = await fixtures(name)

        expected = cleanBlock(expected)
        const blockCid = new multiformats.CID(meta.cid)

        // write
        const outStream = fs.createWriteStream(`${name}.car`)
        const writeDs = await CarDatastore.writeStream(outStream)
        const rootCid = await bitcoin.blockToCar(multiformats, writeDs, expected)
        assert.deepStrictEqual(rootCid.toString(), blockCid.toString())

        // read

        // build an index from the car
        const index = {}
        let blockCount = 0
        const inStream = fs.createReadStream(`${name}.car`)
        const indexer = await CarDatastore.indexer(inStream)
        assert(Array.isArray(indexer.roots))
        assert.strictEqual(indexer.roots.length, 1)
        assert.deepStrictEqual(indexer.roots[0].toString(), blockCid.toString())
        for await (const blockIndex of indexer.iterator) {
          index[blockIndex.cid.toString()] = blockIndex
          blockCount++
        }

        // make a loder that can read blocks from the car
        const fd = await fs.promises.open(`${name}.car`)
        let reads = 0
        async function loader (cid) {
          reads++
          const blockIndex = index[cid.toString()]
          if (!blockIndex) {
            throw new Error(`Block not found: [${cid.toString()}]`)
          }
          const block = await CarDatastore.readRaw(fd, blockIndex)
          return block.binary
        }

        // perform the reassemble!
        const { deserialized: actual, binary } = await bitcoin.assemble(multiformats, loader, blockCid)

        // test transactions separately and then header so any failures don't result in
        // chai diff lockups or are just too big to be useful
        for (let i = 0; i < expected.tx.length; i++) {
          assert.deepEqual(actual[i], expected[i], `transaction #${i} successfully converted`)
        }

        const headerActual = Object.assign({}, actual, { tx: null })
        const headerExpected = Object.assign({}, expected, { tx: null })
        assert.deepEqual(headerActual, headerExpected)

        if (name === 'block') {
          assert.strictEqual(reads, blockCount)
        } else {
          // something less because we don't need to read the non-segwit transactions and maybe parts of the tx merkle
          assert(reads < blockCount)
        }

        assert.strictEqual(binary.toString('hex'), raw.toString('hex'), 're-encoded full binary form matches')

        await fd.close()
      })
    }

    after(async () => {
      for (const name of fixtures.names) {
        try {
          await fs.promises.unlink(`${name}.car`)
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err
          }
        }
      }
    })
  })
})
