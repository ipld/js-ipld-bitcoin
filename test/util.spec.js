/* eslint-env mocha */
'use strict'

const loadFixture = require('aegir/fixtures')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const IpldBitcoin = require('../src/index')
const helpers = require('./helpers')

const fixtureBlockHex = loadFixture('test/fixtures/block.hex')
const fixtureBlockHeader = helpers.headerFromHexBlock(fixtureBlockHex)
const invalidDagNode = {invalid: 'dagNode'}

describe('IPLD format util API deserialize()', () => {
  it('should work correctly', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    verifyBlock(dagNode, {
      version: 2,
      prevHash: '87d6242b27d248a9e145fe764a0bcef03a403883a2e4c8590200000000000000',
      merkleRoot: '11a5b9a70acebedbbf71ef8ca341e8a98cf279c49eee8f92e10a2227743b6aeb',
      timestamp: 1386981279,
      bits: 419740270,
      nonce: 3159344128
    })
  })

  it('should deserialize Segwit correctly (a)', async () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = await IpldBitcoin.util.deserialize(segwitBlockHeader)
    verifyBlock(dagNode, {
      version: 536870914,
      prevHash: '1b7c39197e95b49b38ff96c7bf9e1db4a9f36b5698ecd6000000000000000000',
      merkleRoot: 'c3f2244dfb3c833c62e72e05b7fd1bd6bcba2d6cd455984a1059db7a4bf38348',
      timestamp: 1503722576,
      bits: 402734313,
      nonce: 3781004001
    })
    return verifyCid(
      dagNode,
      '562099014a2fd1503c30f92f8a8306ec4d5409d547ce21d906000000000000000000'
    )
  })

  it('should deserialize Segwit correctly (b)', async () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit2.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = await IpldBitcoin.util.deserialize(segwitBlockHeader)
    verifyBlock(dagNode, {
      version: 536870914,
      prevHash: '92f0d678374dbb0a205345d38f35be782412207bbdaa71000000000000000000',
      merkleRoot: '99e3557bb520c3d45d6eb6ee18f93b3665bf4c8d9747200db4292fdbacc278c3',
      timestamp: 1503851731,
      bits: 402734313,
      nonce: 3911763601
    })
    return verifyCid(
      dagNode,
      '562090bd49e9fae063aa4db26ae434212157c4c72e16492aac000000000000000000'
    )
  })

  it('should deserialize Segwit correctly (c)', async () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit3.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = await IpldBitcoin.util.deserialize(segwitBlockHeader)
    verifyBlock(dagNode, {
      version: 536870912,
      prevHash: '92fed79ebe58e1604dc08037488567c0881e1ae6a67831010000000000000000',
      merkleRoot: '654f3617284e0c0f71baeaea9f54e337645550832b63de3dce4b66b2fbb27309',
      timestamp: 1503848099,
      bits: 402734313,
      nonce: 2945767029
    })
    return verifyCid(
      dagNode,
      '56205bd62fe2f3fe376ff2645681bebe7d12b64d9446ef72d1000000000000000000'
    )
  })

  it('should error on an invalid block', async () => {
    const invalidBlock = Buffer.from('abcdef', 'hex')
    return shouldThrow(IpldBitcoin.util.deserialize(invalidBlock))
  })
})

describe('IPLD format util API serialize()', () => {
  it('should round-trip (de)serialization correctly', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    const binaryBlob = await IpldBitcoin.util.serialize(dagNode)
    expect(binaryBlob).to.deep.equal(fixtureBlockHeader)
  })

  it('should error on an invalid internal representation', async () => {
    return shouldThrow(IpldBitcoin.util.serialize(invalidDagNode))
  })
})

describe('IPLD format util API cid()', () => {
  it('should encode the CID correctly', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    return verifyCid(
      dagNode,
      '56203ec2c691d447b2fd0d6a94742345af1f351037dab1ab9e900200000000000000'
    )
  })

  it('should error on an invalid internal representation', async () => {
    return shouldThrow(IpldBitcoin.util.cid(invalidDagNode))
  })

  it('should encode the CID correctly with options', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    return verifyCid1(
      dagNode,
      { hashAlg: 'sha3-256' },
      '16208fd2802e0304c79c08a1ff2afb706ce64b78f3b94fd1c9142946c2e715589cfb'
    )
  })

  it('should encode the CID correctly with undefined options', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    return verifyCid1(
      dagNode,
      undefined,
      '56203ec2c691d447b2fd0d6a94742345af1f351037dab1ab9e900200000000000000'
    )
  })

  it('should encode the CID correctly with default options specified', async () => {
    const dagNode = await IpldBitcoin.util.deserialize(fixtureBlockHeader)
    return verifyCid1(
      dagNode,
      { version: 1, hashAlg: 'dbl-sha2-256' },
      '56203ec2c691d447b2fd0d6a94742345af1f351037dab1ab9e900200000000000000'
    )
  })
})

const verifyBlock = (dagNode, expected) => {
  expect(dagNode.version).to.equal(expected.version)
  expect(dagNode.prevHash.toString('hex')).to.equal(expected.prevHash)
  expect(dagNode.merkleRoot.toString('hex')).to.equal(expected.merkleRoot)
  expect(dagNode.timestamp).to.equal(expected.timestamp)
  expect(dagNode.bits).to.equal(expected.bits)
  expect(dagNode.nonce).to.equal(expected.nonce)
}

const verifyCid = async (dagNode, expectedCid) => {
  const cid = await IpldBitcoin.util.cid(dagNode)
  expect(cid.multihash.toString('hex')).to.equal(expectedCid)
}

const verifyCid1 = async (dagNode, options, expectedCid) => {
  const cid = await IpldBitcoin.util.cid(dagNode, options)
  expect(cid.multihash.toString('hex')).to.equal(expectedCid)
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
