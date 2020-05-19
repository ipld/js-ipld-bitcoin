const { Buffer } = require('buffer')
const { BitcoinTransaction, fromHashHex, merkle } = require('bitcoin-block')
const { toHex } = require('multiformats/bytes')
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
      hashes.push(NULL_HASH)
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

    // we don't know whether we're dealing with a real transaciton or a binary merkle node,
    // even if length==64. So we should _try_ to decode the tx to see if it might be one.
    // But, in the witness merkle, the lowest, left-most, non-leaf node contains 32-bytes
    // of leading zeros and this makes the bytes decodeable into transaction form
    let tx
    if (buf.length !== 64 || NULL_HASH.compare(buf, 0, 32) !== 0) {
      try {
        tx = BitcoinTransaction.decode(buf, true)
        if (buf.length === 64 && tx.vin.length === 0 && tx.vout.length === 0) {
          // this is almost certainly not a transaction but a binary merkle node with enough leading
          // zeros to fake it
          tx = null
        }
      } catch (err) {
        if (buf.length !== 64) {
          throw err
        }
      }
    }

    if (!tx && buf.length === 64) {
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

    const deserialized = tx.toPorcelain()
    if (tx.isCoinbase()) {
      const witnessCommitment = tx.getWitnessCommitment()
      if (witnessCommitment) {
        // NOTE that this may not be correct, it's possible for a tx to appear to have a witness commitment
        // but it's not. A 38 byte vout scriptPubKey can have the correct leading 6 bytes but not be a
        // witness commitment and we can't discriminate at this point -- we can only do that by trying to
        // load the witness commitment from the generated CID
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

function txHashToCID (multiformats, blockHash) {
  if (typeof blockHash !== 'string') {
    blockHash = toHex(blockHash)
  }
  const mh = multiformats.multihash.encode(fromHashHex(blockHash), HASH_ALG)
  return new multiformats.CID(1, CODEC_TX_CODE, mh)
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
module.exports.txHashToCID = txHashToCID
module.exports.CODEC = CODEC_TX
module.exports.CODEC_CODE = CODEC_TX_CODE
