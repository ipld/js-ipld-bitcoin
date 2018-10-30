/* eslint-env mocha */
'use strict'

const loadFixture = require('aegir/fixtures')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const CID = require('cids')
const IpldBitcoin = require('../src/index')
const helpers = require('./helpers')

const fixtureBlockHex = loadFixture('test/fixtures/block.hex')
const fixtureBlockHeader = helpers.headerFromHexBlock(fixtureBlockHex)
const invalidBlock = Buffer.from('abcdef', 'hex')

describe('IPLD format resolve API resolve()', () => {
  it('should return the deserialized node if no path is given', async () => {
    const value = await IpldBitcoin.resolver.resolve(fixtureBlockHeader)
    expect(value.remainderPath).is.empty()
    expect(value.value).is.not.empty()
  })

  it('should return the deserialized node if path is empty', async () => {
    const value = await IpldBitcoin.resolver.resolve(fixtureBlockHeader, '')
    expect(value.remainderPath).is.empty()
    expect(value.value).is.not.empty()
  })

  it('should return the version', async () => {
    return verifyPath(fixtureBlockHeader, 'version', 2)
  })

  it('should return the timestamp', async () => {
    return verifyPath(fixtureBlockHeader, 'timestamp', 1386981279)
  })

  it('should return the difficulty', async () => {
    return verifyPath(fixtureBlockHeader, 'difficulty', 419740270)
  })

  it('should return the nonce', async () => {
    return verifyPath(fixtureBlockHeader, 'nonce', 3159344128)
  })

  it('should error on non-existent path', async () => {
    return verifyError(fixtureBlockHeader, 'something/random')
  })

  it('should error on path starting with a slash', async () => {
    return verifyError(fixtureBlockHeader, '/version')
  })

  it('should error on partially matching path that isn\'t a link', async () => {
    return verifyError(fixtureBlockHeader, 'version/but/additional/things')
  })

  it('should return a link when parent is requested', async () => {
    const value = await IpldBitcoin.resolver.resolve(fixtureBlockHeader, 'parent')
    expect(value.remainderPath).is.empty()
    expect(value.value).to.deep.equal({
      '/': new CID('z4HFzdHLxSgJvCMJrsDtV7MgqiGALZdbbxgcTLVUUXQGBkGYjLb')
    })
  })

  it('should return a link and remaining path when parent is requested', async () => {
    const value = await IpldBitcoin.resolver.resolve(fixtureBlockHeader, 'parent/timestamp')
    expect(value.remainderPath).to.equal('timestamp')
    expect(value.value).to.deep.equal({
      '/':
      new CID('z4HFzdHLxSgJvCMJrsDtV7MgqiGALZdbbxgcTLVUUXQGBkGYjLb')
    })
  })

  it('should return a link when transactions are requested', async () => {
    const value = await IpldBitcoin.resolver.resolve(fixtureBlockHeader, 'tx/some/remainder')
    expect(value.remainderPath).to.equal('some/remainder')
    expect(value.value).to.deep.equal({
      '/': new CID('z4HFzdHD15kVvtmVzeD7z9sisZ7acSC88wXS3KJGwGrnr2DwcVQ')
    })
  })

  it('should return an error if block is invalid', async () => {
    return verifyError(invalidBlock, 'version')
  })
})

describe('IPLD format resolver API tree()', () => {
  it('should return only paths by default', async () => {
    const value = await IpldBitcoin.resolver.tree(fixtureBlockHeader)
    expect(value).to.deep.equal(['version', 'timestamp', 'difficulty',
      'nonce', 'parent', 'tx'])
  })

  it('should be able to return paths and values', async () => {
    const value = await IpldBitcoin.resolver.tree(fixtureBlockHeader, {values: true})
    expect(value).to.deep.equal({
      version: 2,
      timestamp: 1386981279,
      difficulty: 419740270,
      nonce: 3159344128,
      parent: {
        '/': new CID('z4HFzdHLxSgJvCMJrsDtV7MgqiGALZdbbxgcTLVUUXQGBkGYjLb')},
      tx: {
        '/': new CID('z4HFzdHD15kVvtmVzeD7z9sisZ7acSC88wXS3KJGwGrnr2DwcVQ')}})
  })

  it('should return an error if block is invalid', async () => {
    return shouldThrow(IpldBitcoin.resolver.tree(invalidBlock))
  })
})

describe('IPLD format resolver API properties', () => {
  it('should have `multicodec` defined correctly', (done) => {
    expect(IpldBitcoin.resolver.multicodec).to.equal('bitcoin-block')
    done()
  })

  it('should have `defaultHashAlg` defined correctly', (done) => {
    expect(IpldBitcoin.resolver.defaultHashAlg).to.equal('dbl-sha2-256')
    done()
  })
})

const verifyPath = async (block, path, expected) => {
  const value = await IpldBitcoin.resolver.resolve(block, path)
  expect(value.remainderPath).is.empty()
  expect(value.value).to.deep.equal(expected)
}

const verifyError = async (block, path) => {
  return shouldThrow(IpldBitcoin.resolver.resolve(block, path))
}

const shouldThrow = async (promise) => {
  try {
    await promise
  } catch (e) {
    expect(e).to.exist()
    return
  }

  throw new Error('should have thrown')
}
