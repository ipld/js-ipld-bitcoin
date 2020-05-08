const { Buffer } = require('buffer')
const { BitcoinTransaction, fromHashHex } = require('bitcoin-block')
const HASH_ALG = require('./dbl-sha2-256').name
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
module.exports.encodeNoWitness = encodeNoWitness
module.exports.CODEC = CODEC
module.exports.CODEC_CODE = CODEC_CODE
