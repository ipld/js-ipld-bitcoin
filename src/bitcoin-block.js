const { Buffer } = require('buffer')
const { BitcoinBlock, fromHashHex } = require('bitcoin-block')
const { HASH_ALG, CODEC_BLOCK, CODEC_BLOCK_CODE, CODEC_TX_CODE } = require('./constants')

function encodeInit (multiformats) {
  return function encode (obj) {
    if (typeof obj !== 'object') {
      throw new TypeError('Can only encode() an object')
    }
    return BitcoinBlock.fromPorcelain(Object.assign({}, obj, { tx: null })).encode()
  }
}

function decodeInit (multiformats) {
  return async function decode (buf) {
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }

    const deserialized = BitcoinBlock.decodeHeaderOnly(buf).toPorcelain()

    // insert links derived from native hash hex strings
    const parentHash = await multiformats.multihash.encode(
      fromHashHex(deserialized.previousblockhash), HASH_ALG)
    deserialized.parent = new multiformats.CID(1, CODEC_BLOCK_CODE, parentHash)
    const txHash = await multiformats.multihash.encode(
      fromHashHex(deserialized.merkleroot), HASH_ALG)
    deserialized.tx = new multiformats.CID(1, CODEC_TX_CODE, txHash)

    return deserialized
  }
}

function init (multiformats) {
  return {
    encode: encodeInit(multiformats),
    decode: decodeInit(multiformats),
    name: CODEC_BLOCK,
    code: CODEC_BLOCK_CODE
  }
}

module.exports = init
module.exports.CODEC = CODEC_BLOCK
module.exports.CODEC_CODE = CODEC_BLOCK_CODE
