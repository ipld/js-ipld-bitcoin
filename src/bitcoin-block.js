const { Buffer } = require('buffer')
const { BitcoinBlock, fromHashHex } = require('bitcoin-block')
const { toHex } = require('multiformats/bytes')
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
  return function decode (buf) {
    if (!(buf instanceof Uint8Array && buf.constructor.name === 'Uint8Array')) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }
    buf = Buffer.from(buf)

    const deserialized = BitcoinBlock.decodeHeaderOnly(buf, true).toPorcelain()

    // insert links derived from native hash hex strings
    if (deserialized.previousblockhash) {
      const parentHash = multiformats.multihash.encode(
        fromHashHex(deserialized.previousblockhash), HASH_ALG)
      deserialized.parent = new multiformats.CID(1, CODEC_BLOCK_CODE, parentHash)
    } else {
      // genesis
      deserialized.parent = null
    }
    const txHash = multiformats.multihash.encode(
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

/**
 * Convert a Bitcoin block identifier (hash) to a CID. The identifier should be in big-endian form, i.e. with leading zeros.
 *
 * The process of converting to a CID involves reversing the hash (to little-endian form), encoding as a `dbl-sha2-256` multihash and encoding as a `bitcoin-block` multicodec. This process is reversable, see {@link cidToHash}.
 *
 * @param {object} multiformats a multiformats object with `dbl-sha2-256` multihash and `bitcoin-block` multicodec registered
 * @returns {object} A CID (`multiformats.CID`) object representing this block identifier.
 */
function blockHashToCID (multiformats, blockHash) {
  if (typeof blockHash !== 'string') {
    blockHash = toHex(blockHash)
  }
  const mh = multiformats.multihash.encode(fromHashHex(blockHash), HASH_ALG)
  return new multiformats.CID(1, CODEC_BLOCK_CODE, mh)
}

module.exports = init
module.exports.blockHashToCID = blockHashToCID
module.exports.CODEC = CODEC_BLOCK
module.exports.CODEC_CODE = CODEC_BLOCK_CODE
