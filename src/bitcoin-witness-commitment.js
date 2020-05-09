const { Buffer } = require('buffer')
const { BitcoinTransaction } = require('bitcoin-block')
const HASH_ALG = require('./dbl-sha2-256').name
const dblSha2256 = require('./dbl-sha2-256').encode
const CODEC_TX_CODE = require('./bitcoin-tx').CODEC_CODE
const CODEC_TX = require('./bitcoin-tx').CODEC
const CODEC = 'bitcoin-witness-commitment'
const CODEC_CODE = 0xb2

/*
 * type BitcoinWitnessCommitment struct {
 *   witnessMerkleRoot &BitcoinTransaction
 *   nonce Bytes
 * }
 *
 */

async function encodeWitnessCommitment (multiformats, deserialized, witnessMerkleRoot) {
  if (typeof multiformats !== 'object' || typeof multiformats.multihash !== 'object' ||
      typeof multiformats.multihash.encode !== 'function' ||
      typeof multiformats.CID !== 'function') {
    throw new TypeError('multiformats argument must have multihash and CID capabilities')
  }

  if (typeof deserialized !== 'object' || !Array.isArray(deserialized.tx)) {
    throw new TypeError('deserialized argument must be a Bitcoin block representation')
  }

  if (!Buffer.isBuffer(witnessMerkleRoot) && !multiformats.CID.isCID(witnessMerkleRoot)) {
    throw new TypeError('witnessMerkleRoot must be a Buffer or CID')
  }

  const merkleRootHash = Buffer.isBuffer(witnessMerkleRoot) ? witnessMerkleRoot
    : multiformats.multihash.decode(witnessMerkleRoot.multihash).digest

  const coinbase = BitcoinTransaction.fromPorcelain(deserialized.tx[0])

  if (!coinbase.isCoinbase()) {
    throw new Error('Could not decode coinbase from deserialized data')
  }
  if (!coinbase.segWit) {
    return null
  }

  // the hash we should get at the end, for sanity, but we have to go through the
  // additional effort just to get the binary form of it
  const expectedWitnessCommitment = coinbase.getWitnessCommitment()

  const nonce = coinbase.getWitnessCommitmentNonce()
  const binary = Buffer.concat([merkleRootHash, nonce])

  const hash = dblSha2256(binary)

  if (!hash.equals(expectedWitnessCommitment)) {
    throw new Error('Generated witnessCommitment does not match the expected witnessCommitment in the coinbase')
  }

  const mh = await multiformats.multihash.encode(hash, HASH_ALG)
  const cid = new multiformats.CID(1, CODEC_CODE, mh)

  return { cid, binary }
}

function encodeInit (multiformats) {
  return function encode (obj) {
    if (typeof obj !== 'object') {
      throw new TypeError('bitcoin-witness-commitment must be an object')
    }
    if (!Buffer.isBuffer(obj.nonce)) {
      throw new TypeError('bitcoin-witness-commitment must have a `nonce` Buffer')
    }
    if (!multiformats.CID.isCID(obj.witnessMerkleRoot)) {
      throw new TypeError('bitcoin-witness-commitment must have a `witnessMerkleRoot` CID')
    }
    if (!obj.witnessMerkleRoot.code !== CODEC_TX_CODE) {
      throw new TypeError(`bitcoin-witness-commitment \`witnessMerkleRoot\` must be of type \`${CODEC_TX}\``)
    }
    // nonce + multihash decode
    const witnessHash = multiformats.multihash.decode(obj.witnessMerkleRoot.multihash)
    const encoded = Buffer.concat([witnessHash, obj.nonce])
    return encoded
  }
}

function decodeInit (multiformats) {
  return function decode (buf) {
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }
    if (buf.length !== 64) {
      throw new TypeError('bitcoin-witness-commitment must be a 64-byte Buffer')
    }
    const witnessHash = multiformats.multihash.encode(buf.slice(0, 32))
    const nonce = buf.slice(32)
    const witnessMerkleRoot = new multiformats.CID(1, CODEC_CODE, witnessHash)
    return { witnessMerkleRoot, nonce }
  }
}

module.exports = function (multiformats) {
  return {
    encode: encodeInit(multiformats),
    decode: decodeInit(multiformats),
    name: CODEC,
    code: CODEC_CODE
  }
}
module.exports.encodeWitnessCommitment = encodeWitnessCommitment
module.exports.CODEC = CODEC
module.exports.CODEC_CODE = CODEC_CODE
