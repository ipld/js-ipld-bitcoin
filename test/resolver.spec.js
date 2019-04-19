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
  it('should return the deserialized node if path is empty', () => {
    const value = IpldBitcoin.resolver.resolve(fixtureBlockHeader, '')
    expect(value.remainderPath).is.empty()
    expect(value.value).is.not.empty()
  })

  it('should return the version', () => {
    verifyPath(fixtureBlockHeader, 'version', 2)
  })

  it('should return the timestamp', () => {
    verifyPath(fixtureBlockHeader, 'timestamp', 1386981279)
  })

  it('should return the difficulty', () => {
    verifyPath(fixtureBlockHeader, 'difficulty', 419740270)
  })

  it('should return the nonce', () => {
    verifyPath(fixtureBlockHeader, 'nonce', 3159344128)
  })

  it('should error on non-existent path', () => {
    verifyError(
      fixtureBlockHeader,
      'something/random',
      "Object has no property 'something'"
    )
  })

  it('should error on partially matching path that isn\'t a link', () => {
    verifyError(
      fixtureBlockHeader,
      'version/but/additional/things',
      "Object has no property 'but'"
    )
  })

  it('should return a link when parent is requested', () => {
    const value = IpldBitcoin.resolver.resolve(fixtureBlockHeader, 'parent')
    expect(value.remainderPath).is.empty()
    expect(value.value.equals(
      new CID('z4HFzdHLxSgJvCMJrsDtV7MgqiGALZdbbxgcTLVUUXQGBkGYjLb')
    )).to.be.true()
  })

  it('should return a link and remaining path when parent is requested', () => {
    const value = IpldBitcoin.resolver.resolve(
      fixtureBlockHeader, 'parent/timestamp')
    expect(value.remainderPath).to.equal('timestamp')
    expect(value.value.equals(
      new CID('z4HFzdHLxSgJvCMJrsDtV7MgqiGALZdbbxgcTLVUUXQGBkGYjLb')
    )).to.be.true()
  })

  it('should return a link when transactions are requested', () => {
    const value = IpldBitcoin.resolver.resolve(
      fixtureBlockHeader, 'tx/some/remainder')
    expect(value.remainderPath).to.equal('some/remainder')
    expect(value.value.equals(
      new CID('z4HFzdHD15kVvtmVzeD7z9sisZ7acSC88wXS3KJGwGrnr2DwcVQ')
    )).to.be.true()
  })

  it('should return an error if block is invalid', () => {
    verifyError(
      invalidBlock, 'version', 'Bitcoin block header needs to be 80 bytes')
  })
})

describe('IPLD format resolver API tree()', () => {
  it('should return only paths by default', () => {
    const value = IpldBitcoin.resolver.tree(fixtureBlockHeader)
    const paths = [...value]
    expect(paths).to.have.members([
      'version',
      'timestamp',
      'difficulty',
      'nonce',
      'parent',
      'tx'
    ])
  })

  it('should return an error if block is invalid', () => {
    expect(() => {
      IpldBitcoin.resolver.tree(invalidBlock).next()
    }).to.throw('Bitcoin block header needs to be 80 bytes')
  })
})

const verifyPath = (block, path, expected) => {
  const value = IpldBitcoin.resolver.resolve(block, path)
  expect(value.remainderPath).is.empty()
  expect(value.value).is.equal(expected)
}

const verifyError = (block, path, error) => {
  expect(() =>
    IpldBitcoin.resolver.resolve(block, path)
  ).to.throw(error)
}
