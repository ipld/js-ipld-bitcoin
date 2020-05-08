const { Buffer } = require('buffer')
const { BitcoinTransaction, fromHashHex, merkle } = require('bitcoin-block')
const HASH_ALG = require('./dbl-sha2-256').name
const dblSha2256 = require('./dbl-sha2-256').encode
const CODEC = 'bitcoin-tx'
const CODEC_CODE = 0xb1

function _encode (obj, arg) {
  if (typeof obj !== 'object') {
    throw new TypeError('Can only encode() an object')
  }
  return BitcoinTransaction.fromPorcelain(obj).encode(arg)
}

function encode (obj) {
  return _encode(obj)
}

function encodeNoWitness (obj) {
  return _encode(obj, BitcoinTransaction.HASH_NO_WITNESS)
}

async function * _encodeAll (multiformats, tx, arg) {
  if (typeof multiformats !== 'object' || typeof multiformats.multihash !== 'object' ||
      typeof multiformats.multihash.encode !== 'function' ||
      typeof multiformats.CID !== 'function') {
    throw new TypeError('multiformats argument must have multihash and CID capabilities')
  }

  if (!Array.isArray(tx)) {
    throw new TypeError('tx argument must be an array')
  }

  const hashes = []
  for (const transaction of tx) {
    const binary = encode(transaction, arg)
    const hash = dblSha2256(binary)
    const mh = await multiformats.multihash.encode(hash, HASH_ALG)
    const cid = new multiformats.CID(1, CODEC_CODE, mh)
    yield { cid, binary } // base tx
    hashes.push(hash)
  }

  for (const { hash, data } of merkle(hashes)) {
    if (data) {
      const mh = await multiformats.multihash.encode(hash, HASH_ALG)
      const cid = new multiformats.CID(1, CODEC_CODE, mh)
      yield { cid, binary: Buffer.concat(data) } // tx merkle
    }
  }
}

function encodeAll (multiformats, obj) {
  return _encodeAll(multiformats, obj)
}

function encodeAllNoWitness (multiformats, obj) {
  return _encodeAll(multiformats, obj, BitcoinTransaction.HASH_NO_WITNESS)
}

function decodeInit (multiformats) {
  return async function decode (buf) {
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }

    const deserialized = BitcoinTransaction.decode(buf).toPorcelain()
    for (const vin of deserialized.vin) {
      if (typeof vin.txid === 'string' && /^[0-9a-f]{64}$/.test(vin.txid)) {
        const txidMh = await multiformats.multihash.encode(fromHashHex(vin.txid), HASH_ALG)
        vin.tx = new multiformats.CID(1, CODEC_CODE, txidMh)
      }
    }

    return deserialized
  }
}

module.exports = function (multiformats) {
  return {
    encode,
    encodeNoWitness,
    decode: decodeInit(multiformats),
    name: CODEC,
    code: CODEC_CODE
  }
}
module.exports.encodeAll = encodeAll
module.exports.encodeAllNoWitness = encodeAllNoWitness
module.exports.encodeNoWitness = encodeNoWitness
module.exports.CODEC = CODEC
module.exports.CODEC_CODE = CODEC_CODE
