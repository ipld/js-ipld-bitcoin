const { Buffer } = require('buffer')
const { BitcoinTransaction, fromHashHex, merkle } = require('bitcoin-block')
const dblSha2256 = require('./dbl-sha2-256').encode
const { HASH_ALG, CODEC_TX, CODEC_TX_CODE, CODEC_WITNESS_COMMITMENT_CODE } = require('./constants')
const NULL_HASH = Buffer.alloc(32)

function _encode (obj, arg) {
  if (typeof obj !== 'object') {
    throw new TypeError('Can only encode() an object')
  }
  const bitcoinTransaction = BitcoinTransaction.fromPorcelain(obj)
  const binary = bitcoinTransaction.encode(arg)
  return { bitcoinTransaction, binary }
}

function encode (obj) {
  return _encode(obj).binary
}

function encodeNoWitness (obj) {
  return _encode(obj, BitcoinTransaction.HASH_NO_WITNESS).binary
}

async function * _encodeAll (multiformats, deserialized, arg) {
  if (typeof multiformats !== 'object' || typeof multiformats.multihash !== 'object' ||
      typeof multiformats.multihash.encode !== 'function' ||
      typeof multiformats.CID !== 'function') {
    throw new TypeError('multiformats argument must have multihash and CID capabilities')
  }

  if (typeof deserialized !== 'object' || !Array.isArray(deserialized.tx)) {
    throw new TypeError('deserialized argument must be a Bitcoin block representation')
  }

  const hashes = []
  for (let ii = 0; ii < deserialized.tx.length; ii++) {
    if (ii === 0 && arg !== BitcoinTransaction.HASH_NO_WITNESS) {
      // for full-witness merkles, the coinbase is replaced with a 0x00.00 hash in the first
      // position, we don't give this a CID+Binary designation but pretend it's not there on
      // decode
      hashes.push(Buffer.alloc(32))
      continue
    }
    const { transaction, binary } = _encode(deserialized.tx[ii], arg)
    const hash = dblSha2256(binary)
    const mh = await multiformats.multihash.encode(hash, HASH_ALG)
    const cid = new multiformats.CID(1, CODEC_TX_CODE, mh)
    yield { cid, binary, transaction } // base tx
    hashes.push(hash)
  }

  for (const { hash, data } of merkle(hashes)) {
    if (data) {
      const mh = await multiformats.multihash.encode(hash, HASH_ALG)
      const cid = new multiformats.CID(1, CODEC_TX_CODE, mh)
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
  return function decode (buf) {
    if (!(buf instanceof Uint8Array && buf.constructor.name === 'Uint8Array')) {
      throw new TypeError('Can only decode() a Buffer or Uint8Array')
    }
    buf = Buffer.from(buf)

    if (buf.length === 64) {
      // is some kind of merkle node
      let left = buf.slice(0, 32)
      const right = buf.slice(32)
      if (NULL_HASH.equals(left)) { // in the witness merkle, the coinbase is replaced with 0x00..00
        left = null
      }
      const leftMh = left ? multiformats.multihash.encode(left, HASH_ALG) : null
      const rightMh = multiformats.multihash.encode(right, HASH_ALG)
      const leftCid = left ? new multiformats.CID(1, CODEC_TX_CODE, leftMh) : null
      const rightCid = new multiformats.CID(1, CODEC_TX_CODE, rightMh)
      return [leftCid, rightCid]
    }

    const tx = BitcoinTransaction.decode(buf)
    const deserialized = tx.toPorcelain()
    if (tx.isCoinbase()) {
      const witnessCommitment = tx.getWitnessCommitment()
      if (witnessCommitment) {
        const witnessCommitmentMh = multiformats.multihash.encode(witnessCommitment, HASH_ALG)
        const witnessCommitmentCid = new multiformats.CID(1, CODEC_WITNESS_COMMITMENT_CODE, witnessCommitmentMh)
        deserialized.witnessCommitment = witnessCommitmentCid
      }
    }
    for (const vin of deserialized.vin) {
      if (typeof vin.txid === 'string' && /^[0-9a-f]{64}$/.test(vin.txid)) {
        const txidMh = multiformats.multihash.encode(fromHashHex(vin.txid), HASH_ALG)
        vin.tx = new multiformats.CID(1, CODEC_TX_CODE, txidMh)
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
    name: CODEC_TX,
    code: CODEC_TX_CODE
  }
}
module.exports.encodeAll = encodeAll
module.exports.encodeAllNoWitness = encodeAllNoWitness
module.exports.encodeNoWitness = encodeNoWitness
module.exports.CODEC = CODEC_TX
module.exports.CODEC_CODE = CODEC_TX_CODE
