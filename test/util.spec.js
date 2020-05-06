/* eslint-env mocha */
'use strict'

const loadFixture = require('aegir/fixtures')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const CID = require('cids')
const multicodec = require('multicodec')
const { fromHashHex } = require('bitcoin-block')
const multihash = require('multihashes')

const IpldBitcoin = require('../src/index')
const helpers = require('./helpers')

const fixtureBlockHex = loadFixture('test/fixtures/block.hex')
const fixtureBlockHeader = helpers.headerFromHexBlock(fixtureBlockHex)
const invalidDagNode = { invalid: 'dagNode' }

function cidFromHashHex (hash, codec) {
  return new CID(1, codec, multihash.encode(fromHashHex(hash), 'dbl-sha2-256'))
}

describe('IPLD format util API deserialize()', () => {
  it('should work correctly', () => {
    const dagNode = IpldBitcoin.util.deserialize(fixtureBlockHeader)
    expect(dagNode).to.deep.equal({
      hash: '0000000000000002909eabb1da3710351faf452374946a0dfdb247d491c6c23e',
      version: 2,
      versionHex: '00000002',
      merkleroot: 'eb6a3b7427220ae1928fee9ec479f28ca9e841a38cef71bfdbbece0aa7b9a511',
      tx: cidFromHashHex('eb6a3b7427220ae1928fee9ec479f28ca9e841a38cef71bfdbbece0aa7b9a511', 'bitcoin-tx'),
      time: 1386981279,
      nonce: 3159344128,
      bits: '1904ba6e',
      difficulty: 908350862.437022,
      previousblockhash: '000000000000000259c8e4a28338403af0ce0b4a76fe45e1a948d2272b24d687',
      parent: cidFromHashHex('000000000000000259c8e4a28338403af0ce0b4a76fe45e1a948d2272b24d687', 'bitcoin-block')
    })
  })

  it('should deserialize Segwit correctly (a)', () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = IpldBitcoin.util.deserialize(segwitBlockHeader)

    expect(dagNode).to.deep.equal({
      hash: '00000000000000000006d921ce47d509544dec06838a2ff9303c50d12f4a0199',
      version: 536870914,
      versionHex: '20000002',
      merkleroot: '4883f34b7adb59104a9855d46c2dbabcd61bfdb7052ee7623c833cfb4d24f2c3',
      tx: cidFromHashHex('4883f34b7adb59104a9855d46c2dbabcd61bfdb7052ee7623c833cfb4d24f2c3', 'bitcoin-tx'),
      time: 1503722576,
      nonce: 3781004001,
      bits: '18013ce9',
      difficulty: 888171856257.3206,
      previousblockhash: '000000000000000000d6ec98566bf3a9b41d9ebfc796ff389bb4957e19397c1b',
      parent: cidFromHashHex('000000000000000000d6ec98566bf3a9b41d9ebfc796ff389bb4957e19397c1b', 'bitcoin-block')
    })
  })

  it('should deserialize Segwit correctly (b)', () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit2.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = IpldBitcoin.util.deserialize(segwitBlockHeader)
    expect(dagNode).to.deep.equal({
      hash: '000000000000000000ac2a49162ec7c457212134e46ab24daa63e0fae949bd90',
      version: 536870914,
      versionHex: '20000002',
      merkleroot: 'c378c2acdb2f29b40d2047978d4cbf65363bf918eeb66e5dd4c320b57b55e399',
      tx: cidFromHashHex('c378c2acdb2f29b40d2047978d4cbf65363bf918eeb66e5dd4c320b57b55e399', 'bitcoin-tx'),
      time: 1503851731,
      nonce: 3911763601,
      bits: '18013ce9',
      difficulty: 888171856257.3206,
      previousblockhash: '00000000000000000071aabd7b20122478be358fd34553200abb4d3778d6f092',
      parent: cidFromHashHex('00000000000000000071aabd7b20122478be358fd34553200abb4d3778d6f092', 'bitcoin-block')
    })
  })

  it('should deserialize Segwit correctly (c)', () => {
    const segwitBlockHex = loadFixture('test/fixtures/segwit3.hex')
    const segwitBlockHeader = helpers.headerFromHexBlock(segwitBlockHex)
    const dagNode = IpldBitcoin.util.deserialize(segwitBlockHeader)
    expect(dagNode).to.deep.equal({
      hash: '000000000000000000d172ef46944db6127dbebe815664f26f37fef3e22fd65b',
      version: 536870912,
      versionHex: '20000000',
      merkleroot: '0973b2fbb2664bce3dde632b8350556437e3549feaeaba710f0c4e2817364f65',
      tx: cidFromHashHex('0973b2fbb2664bce3dde632b8350556437e3549feaeaba710f0c4e2817364f65', 'bitcoin-tx'),
      time: 1503848099,
      nonce: 2945767029,
      bits: '18013ce9',
      difficulty: 888171856257.3206,
      previousblockhash: '0000000000000000013178a6e61a1e88c06785483780c04d60e158be9ed7fe92',
      parent: cidFromHashHex('0000000000000000013178a6e61a1e88c06785483780c04d60e158be9ed7fe92', 'bitcoin-block')
    })
  })

  it('should error on an invalid block', () => {
    const invalidBlock = Buffer.from('abcdef', 'hex')
    expect(() => {
      IpldBitcoin.util.deserialize(invalidBlock)
    }).to.throw('Bitcoin block header needs to be 80 bytes')
  })
})

describe('IPLD format util API serialize()', () => {
  it('should round-trip (de)serialization correctly', () => {
    const dagNode = IpldBitcoin.util.deserialize(fixtureBlockHeader)
    const binaryBlob = IpldBitcoin.util.serialize(dagNode)
    expect(binaryBlob).to.deep.equal(fixtureBlockHeader)
  })

  it('should error on an invalid internal representation', () => {
    expect(() => {
      IpldBitcoin.util.serialize(invalidDagNode)
    }).to.throw()
  })
})

describe('IPLD format util API cid()', () => {
  const expectedCid = new CID(1, 'bitcoin-block', Buffer.from(
    '56203ec2c691d447b2fd0d6a94742345af1f351037dab1ab9e900200000000000000',
    'hex'))

  it('should encode the CID correctly', async () => {
    const cid = await IpldBitcoin.util.cid(fixtureBlockHeader)
    expect(cid.equals(expectedCid)).to.be.true()
  })

  it('should encode the CID correctly with options', async () => {
    const cid = await IpldBitcoin.util.cid(fixtureBlockHeader, {
      hashAlg: multicodec.SHA3_256
    })
    expect(cid.equals(new CID(1, 'bitcoin-block', Buffer.from(
      '16208fd2802e0304c79c08a1ff2afb706ce64b78f3b94fd1c9142946c2e715589cfb',
      'hex'
    )))).to.be.true()
  })

  it('should encode the CID correctly with default options specified', async () => {
    const cid = await IpldBitcoin.util.cid(fixtureBlockHeader, {
      cidVersion: 1,
      hashAlg: multicodec.DBL_SHA2_256
    })
    expect(cid.equals(expectedCid)).to.be.true()
  })
})
