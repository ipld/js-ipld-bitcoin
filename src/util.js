'use strict'

const BitcoinjsBlock = require('bitcoinjs-lib').Block
const CID = require('cids')
const multihashes = require('multihashes')
const multihashing = require('multihashing-async')

const BITCOIN_BLOCK_HEADER_SIZE = 80

/**
 * Serialize internal representation into a binary Bitcoin block.
 *
 * @param {BitcoinBlock} dagNode - Internal representation of a Bitcoin block
 * @returns {Promise<Buffer>} - Binary Bitcoin block if serialization was
 *   successful
 */
const serialize = async (dagNode) => {
  return dagNode.toBuffer(true)
}

/**
 * Deserialize Bitcoin block into the internal representation,
 *
 * @param {Buffer} binaryBlob - Binary representation of a Bitcoin block
 * @returns {Promise<BitcoinBlock>} - Internal representation of a Bitcoin block
 *   if deserialization was successful
 */
const deserialize = async (binaryBlob) => {
  if (binaryBlob.length !== BITCOIN_BLOCK_HEADER_SIZE) {
    throw new Error(`Bitcoin block header needs to be ${BITCOIN_BLOCK_HEADER_SIZE} bytes`)
  }

  return BitcoinjsBlock.fromBuffer(binaryBlob)
}

/**
 * Get the CID of the DAG-Node.
 *
 * @param {BitcoinBlock} dagNode - Internal representation of a Bitcoin block
 * @param {Object} [options] - Options to create the CID
 * @param {number} [options.version=1] - CID version number
 * @param {string} [options.hashAlg='dbl-sha2-256'] - Hashing algorithm
 * @returns {Promise<CID>}
 */
const cid = async (dagNode, options = {}) => {
  // avoid deadly embrace between resolver and util
  const hashAlg = options.hashAlg || require('./resolver').defaultHashAlg
  const version = typeof options.version === 'undefined' ? 1 : options.version

  return new Promise((resolve, reject) => {
    multihashing(dagNode.toBuffer(true), hashAlg, (err, mh) => {
      if (err) return reject(err)
      resolve(new CID(version, 'bitcoin-block', mh))
    })
  })
}

// Convert a Bitcoin hash (as Buffer) to a CID
const hashToCid = (hash) => {
  // avoid deadly embrace between resolver and util
  const defaultHashAlg = require('./resolver').defaultHashAlg
  const multihash = multihashes.encode(hash, defaultHashAlg)
  const cidVersion = 1
  const cid = new CID(cidVersion, 'bitcoin-block', multihash)
  return cid
}

module.exports = {
  hashToCid: hashToCid,
  BITCOIN_BLOCK_HEADER_SIZE: BITCOIN_BLOCK_HEADER_SIZE,

  // Public API
  cid: cid,
  deserialize: deserialize,
  serialize: serialize
}
