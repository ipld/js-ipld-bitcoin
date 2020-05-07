const { Buffer } = require('buffer')
const { BitcoinTransaction } = require('bitcoin-block')
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

function decode (buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('Can only decode() a Buffer or Uint8Array')
  }

  return BitcoinTransaction.decode(buf).toPorcelain()
}

module.exports = {
  encode,
  encodeNoWitness,
  decode,
  name: CODEC,
  code: CODEC_CODE,
  CODEC: CODEC,
  CODEC_CODE: CODEC_CODE
}
