const { Buffer } = require('buffer')
const { BitcoinTransaction } = require('bitcoin-block')
const dblSha2256 = require('./dbl-sha2-256').encode
const { HASH_ALG, CODEC_TX, CODEC_TX_CODE, CODEC_WITNESS_COMMITMENT, CODEC_WITNESS_COMMITMENT_CODE } = require('./constants')
const NULL_HASH = Buffer.alloc(32)

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

  if (witnessMerkleRoot !== null && !Buffer.isBuffer(witnessMerkleRoot) && !multiformats.CID.isCID(witnessMerkleRoot)) {
    throw new TypeError('witnessMerkleRoot must be a Buffer or CID')
  }

  let merkleRootHash
  if (witnessMerkleRoot === null) {
    // block has single tx, the coinbase, and it gets a NULL in the merkle, see bitcoin-tx for
    // why this is missing and explicitly `null`
    merkleRootHash = NULL_HASH
  } else if (Buffer.isBuffer(witnessMerkleRoot)) {
    merkleRootHash = witnessMerkleRoot
  } else {
    // CID
    merkleRootHash = multiformats.multihash.decode(witnessMerkleRoot.multihash).digest
  }

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
  const cid = new multiformats.CID(1, CODEC_WITNESS_COMMITMENT_CODE, mh)

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
    if (!(buf instanceof Uint8Array && buf.constructor.name === 'Uint8Array')) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }
    buf = Buffer.from(buf)
    if (buf.length !== 64) {
      throw new TypeError('bitcoin-witness-commitment must be a 64-byte Buffer')
    }
    const witnessHash = buf.slice(0, 32)
    const nonce = buf.slice(32)

    let witnessMerkleRoot = null
    if (!NULL_HASH.equals(Buffer.from(witnessHash))) {
      const witnessMHash = multiformats.multihash.encode(witnessHash, HASH_ALG)
      witnessMerkleRoot = new multiformats.CID(1, CODEC_TX_CODE, witnessMHash)
    }
    return { witnessMerkleRoot, nonce }
  }
}

module.exports = function (multiformats) {
  return {
    encode: encodeInit(multiformats),
    decode: decodeInit(multiformats),
    name: CODEC_WITNESS_COMMITMENT,
    code: CODEC_WITNESS_COMMITMENT_CODE
  }
}
module.exports.encodeWitnessCommitment = encodeWitnessCommitment
module.exports.CODEC = CODEC_WITNESS_COMMITMENT
module.exports.CODEC_CODE = CODEC_WITNESS_COMMITMENT_CODE
