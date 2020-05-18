/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats')()
const { setupMultiformats, setupBlocks, fixtureNames, toHex, roundDifficulty } = require('./util')

describe('header', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  test('decode block, header only', async () => {
    const decoded = await multiformats.decode(blocks.block.raw.slice(0, 80), 'bitcoin-block')
    assert.deepEqual(decoded, blocks.block.expectedHeader, 'decoded header correctly')
  })

  for (const name of fixtureNames) {
    describe(`block "${name}"`, () => {
      test('decode full raw', async () => {
        const decoded = await multiformats.decode(blocks[name].raw, 'bitcoin-block')
        assert.deepEqual(roundDifficulty(decoded), roundDifficulty(blocks[name].expectedHeader), 'decoded header correctly')
      })

      test('encode', async () => {
        const encoded = await multiformats.encode(blocks[name].expectedHeader, 'bitcoin-block')
        assert.strictEqual(toHex(encoded), toHex(blocks[name].raw.slice(0, 80)), 'raw bytes match')
      })
    })
  }
})
