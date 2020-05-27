const dblSha2256 = require('./dbl-sha2-256')
const block = require('./bitcoin-block')
const tx = require('./bitcoin-tx')
const witnessCommitment = require('./bitcoin-witness-commitment')
const { BitcoinBlock, toHashHex } = require('bitcoin-block')
const { encodeAll, assemble } = require('./complete')

/**
 * Instantiate a full object form from a full Bitcoin block graph binary representation. This binary form is typically extracted from a Bitcoin network node, such as with the Bitcoin Core `bitcoin-cli` `getblock <identifier> 0` command (which outputs hexadecimal form and therefore needs to be decoded prior to handing to this function). This full binary form can also be obtained from the utility {@link assemble} function which can construct the full graph form of a Bitcoin block from the full IPLD block graph.
 *
 * The object returned, if passed through `JSON.stringify()` should be identical to the JSON form provided by the Bitcoin Core `bitcoin-cli` `getblock <identifier> 2` command (minus some chain-context elements that are not possible to derive without the full blockchain).
 *
 * @param {Uint8Array|Buffer} a binary form of a Bitcoin block graph
 * @returns {object} an object representation of the full Bitcoin block graph
 * @function
 */
function deserializeFullBitcoinBinary (binary) {
  return BitcoinBlock.decode(binary).toPorcelain()
}

/**
 * Encode a full object form of a Bitcoin block graph into its binary equivalent. This is the inverse of {@link deserializeFullBitcoinBinary} and should produce the exact binary representation of a Bitcoin block graph given the complete input.
 *
 * The object form must include both the header and full transaction (including witness data) data for it to be properly serialized.
 *
 * As of writing, the witness merkle nonce is not currently present in the JSON output from Bitcoin Core's `bitcoin-cli`. See https://github.com/bitcoin/bitcoin/pull/18826 for more information. Without this nonce, the exact binary form cannot be fully generated.
 *
 * @param {object} a full JavaScript object form of a Bitcoin block graph
 * @returns {Buffer} a binary form of the Bitcoin block graph
 * @function
 */
function serializeFullBitcoinBinary (obj) {
  return BitcoinBlock.fromPorcelain(obj).encode()
}

/**
 * Extract all IPLD blocks from a full Bitcoin block graph and write them to a CAR archive.
 *
 * This operation requires a full deserialized Bitcoin block graph, where the transactions in their full form (with witness data intact post-segwit), as typically presented in JSON form with the Bitcoin Core `bitcoin-cli` command `getblock <identifier> 2` or using one of the utilities here to instantiate a full object form.
 *
 * The CAR archive should be created using [datastore-car](https://github.com/ipld/js-datastore-car) and should be capable of write operations.
 *
 * @param {object} a multiformats object with `dbl-sha2-256` multihash, `bitcoin-block`, `bitcoin-tx` and `bitcoin-witness-commitment` multicodecs as well as the `dag-cbor` multicodec which is required for writing the CAR header.
 * @param {object} an initialized and writable `CarDatastore` instance.
 * @param {object} a full Bitcoin block graph.
 * @returns {object} a CID for the root block (the header `bitcoin-block`).
 * @function
 */
async function blockToCar (multiformats, carWriter, obj) {
  let root
  for await (const { cid, binary } of encodeAll(multiformats, obj)) {
    if (!root) {
      root = cid
      await carWriter.setRoots(cid)
    }
    await carWriter.put(cid, binary)
  }

  await carWriter.close()
  return root
}

/**
 * Convert a CID to a Bitcoin block or transaction identifier. This process is the reverse of {@link blockHashToCID} and {@link txHashToCID} and involves extracting and decoding the multihash from the CID, reversing the bytes and presenting it as a big-endian hexadecimal string.
 *
 * Works for both block identifiers and transaction identifiers.
 *
 * @param {object} a multiformats object
 * @param {object} a CID (`multiformats.CID`)
 * @returns {string} a hexadecimal big-endian representation of the identifier.
 * @function
 */
function cidToHash (multiformats, cid) {
  if (!multiformats.CID.isCID(cid)) {
    cid = new multiformats.CID(cid)
  }
  const { digest } = multiformats.multihash.decode(cid.multihash)
  return toHashHex(digest)
}

module.exports = [
  dblSha2256,
  block,
  tx,
  witnessCommitment
]
module.exports.deserializeFullBitcoinBinary = deserializeFullBitcoinBinary
module.exports.serializeFullBitcoinBinary = serializeFullBitcoinBinary
module.exports.blockToCar = blockToCar
module.exports.assemble = assemble
module.exports.blockHashToCID = block.blockHashToCID
module.exports.cidToHash = cidToHash
module.exports.txHashToCID = tx.txHashToCID
