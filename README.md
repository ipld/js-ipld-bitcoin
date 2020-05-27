# IPLD for Bitcoin

**JavaScript Bitcoin data multiformats codecs and utilities for IPLD**

![CI](https://github.com/rvagg/js-bitcoin/workflows/CI/badge.svg)

## About

This codec is intended to be used with **[multiformats](https://github.com/multiformats/js-multiformats)** and **[@ipld/block](https://github.com/ipld/js-block)**. It provides decode and encode functionality for the Bitcoin native format to and from IPLD.

The primary usage of this library is as a codec added to a `multiformats` object:

```js
const multiformats = require('multiformats')()
multiformats.add(require('@ipld/bitcoin'))
```

The following multicodecs are registered:

* `bitcoin-block` / `0xb0`: The Bitcoin block header, commonly identified by "Bitcoin block identifiers" (hashes with leading zeros).
* `bitcoin-tx` / `0xb1`: Bitcoin transactions _and_ nodes in a binary merkle tree, the tip of which is referenced by the Bitcoin block header.
* `bitcoin-witness-commitment` / `0xb2`: The Bitcoin witness commitment that is used to reference transactions with intact witness data (a complication introduced by [SegWit](https://en.wikipedia.org/wiki/SegWit)).

These multicodecs support `encode()` and `decode()` functionality through `multiformats`.

The following multihash is registered:

* `dbl-sha2-256` / `0x56`: A double SHA2-256 hash: `SHA2-256(SHA2-256(bytes))`, used natively across all Bitcoin blocks, forming block identifiers, transaction identifiers and hashes and binary merkle tree nodes.

In addition to the multiformats codecs and hash, utilities are also provided to convert between Bitcoin hash identifiers and CIDs and to convert to and from full Bitcoin raw block data to a full collection of IPLD blocks. Additional conversion functionality for bitcoin raw data and the `bitcoin-cli` JSON format is provided by the **[bitcoin-block](https://github.com/rvagg/js-bitcoin-block)** library.

See the **API** section below for details on the additional utility functions.

The previous incarnation of the Bitcoin codec for IPLD can be found at <https://github.com/ipld/js-ipld-bitcoin>.

## Example

```js
const multiformats = require('multiformats/basics')
multiformats.add(require('@ipld/bitcoin'))
const CarDatastore = require('datastore-car')(multiformats)

const carDs = await CarDatastore.readFileComplete('/path/to/bundle/of/blocks.car')
const headerCid = ipldBitcoin.blockHashToCID(multiformats, hash)
const header = multiformats.decode(await carDs.get(headerCid), 'bitcoin-block')

// navigate the transaction binary merkle tree to the first transaction, the coinbase
let txCid = header.tx
let tx
while (true) {
	tx = multiformats.decode(await carDs.get(txCid), 'bitcoin-tx')
	if (!Array.isArray(tx)) { // is not an inner merkle tree node
		break
	}
	txCid = tx[0] // leftmost side of the tx binary merkle
}

// convert the scriptSig to UTF-8 and cross our fingers that there's something
// interesting in there
console.log(Buffer.from(tx.vin[0].coinbase, 'hex').toString('utf8'))
```

## API

### Contents

 * [`deserializeFullBitcoinBinary(binary)`](#deserializeFullBitcoinBinary)
 * [`serializeFullBitcoinBinary(obj)`](#serializeFullBitcoinBinary)
 * [`async blockToCar(multiformats, carWriter, obj)`](#blockToCar)
 * [`cidToHash(multiformats, cid)`](#cidToHash)
 * [`async assemble(multiformats, loader, blockCID)`](#assemble)
 * [`blockHashToCID(multiformats)`](#blockHashToCID)
 * [`txHashToCID(multiformats)`](#txHashToCID)

<a name="deserializeFullBitcoinBinary"></a>
### `deserializeFullBitcoinBinary(binary)`

Instantiate a full object form from a full Bitcoin block graph binary representation. This binary form is typically extracted from a Bitcoin network node, such as with the Bitcoin Core `bitcoin-cli` `getblock <identifier> 0` command (which outputs hexadecimal form and therefore needs to be decoded prior to handing to this function). This full binary form can also be obtained from the utility [`assemble`](#assemble) function which can construct the full graph form of a Bitcoin block from the full IPLD block graph.

The object returned, if passed through `JSON.stringify()` should be identical to the JSON form provided by the Bitcoin Core `bitcoin-cli` `getblock <identifier> 2` command (minus some chain-context elements that are not possible to derive without the full blockchain).

**Parameters:**

* **`binary`** _(`Uint8Array|Buffer`)_: a binary form of a Bitcoin block graph

**Return value**  _(`object`)_: an object representation of the full Bitcoin block graph

<a name="serializeFullBitcoinBinary"></a>
### `serializeFullBitcoinBinary(obj)`

Encode a full object form of a Bitcoin block graph into its binary equivalent. This is the inverse of [`deserializeFullBitcoinBinary`](#deserializeFullBitcoinBinary) and should produce the exact binary representation of a Bitcoin block graph given the complete input.

The object form must include both the header and full transaction (including witness data) data for it to be properly serialized.

As of writing, the witness merkle nonce is not currently present in the JSON output from Bitcoin Core's `bitcoin-cli`. See https://github.com/bitcoin/bitcoin/pull/18826 for more information. Without this nonce, the exact binary form cannot be fully generated.

**Parameters:**

* **`obj`** _(`object`)_: a full JavaScript object form of a Bitcoin block graph

**Return value**  _(`Buffer`)_: a binary form of the Bitcoin block graph

<a name="blockToCar"></a>
### `async blockToCar(multiformats, carWriter, obj)`

Extract all IPLD blocks from a full Bitcoin block graph and write them to a CAR archive.

This operation requires a full deserialized Bitcoin block graph, where the transactions in their full form (with witness data intact post-segwit), as typically presented in JSON form with the Bitcoin Core `bitcoin-cli` command `getblock <identifier> 2` or using one of the utilities here to instantiate a full object form.

The CAR archive should be created using [datastore-car](https://github.com/ipld/js-datastore-car) and should be capable of write operations.

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash, `bitcoin-block`, `bitcoin-tx` and `bitcoin-witness-commitment` multicodecs as well as the `dag-cbor` multicodec which is required for writing the CAR header.
* **`carWriter`** _(`object`)_: an initialized and writable `CarDatastore` instance.
* **`obj`** _(`object`)_: a full Bitcoin block graph.

**Return value**  _(`object`)_: a CID for the root block (the header `bitcoin-block`).

<a name="cidToHash"></a>
### `cidToHash(multiformats, cid)`

Convert a CID to a Bitcoin block or transaction identifier. This process is the reverse of [`blockHashToCID`](#blockHashToCID) and [`txHashToCID`](#txHashToCID) and involves extracting and decoding the multihash from the CID, reversing the bytes and presenting it as a big-endian hexadecimal string.

Works for both block identifiers and transaction identifiers.

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object
* **`cid`** _(`object`)_: a CID (`multiformats.CID`)

**Return value**  _(`string`)_: a hexadecimal big-endian representation of the identifier.

<a name="assemble"></a>
### `async assemble(multiformats, loader, blockCID)`

Given a CID for a `bitcoin-block` Bitcoin block header and an IPLD block loader that can retrieve Bitcoin IPLD blocks by CID, re-assemble a full Bitcoin block graph into both object and binary forms.

The loader should be able to return the binary form for `bitcoin-block`, `bitcoin-tx` and `bitcoin-witness-commitment` CIDs.

Note that there are approximately 4,000 Bitcoin block graphs pre-SegWit which have the appearance of SegWit blocks but are, in fact, not. These blocks will cause the loader to be called for `bitcoin-witness-commitment` CIDs that will not resolve. Such resolution should throw an `Error` but this will not be propagated, but rather be used as a signal that the block is not a SegWit block and the assembler should not proceed to load it as such.

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with the Bitcoin multicodec and multihash installed
* **`loader`** _(`function`)_: an IPLD block loader function that takes a CID argument and returns a `Buffer` or `Uint8Array` containing the binary block data for that CID
* **`blockCID`** _(`CID`)_: a CID of type `bitcoin-block` pointing to the Bitcoin block header for the block to be assembled

**Return value**  _(`object`)_: an object containing two properties, `deserialized` and `binary` where `deserialized` contains a full JavaScript instantiation of the Bitcoin block graph and `binary` contains a `Buffer` with the binary representation of the graph.

<a name="blockHashToCID"></a>
### `blockHashToCID(multiformats)`

Convert a Bitcoin block identifier (hash) to a CID. The identifier should be in big-endian form, i.e. with leading zeros.

The process of converting to a CID involves reversing the hash (to little-endian form), encoding as a `dbl-sha2-256` multihash and encoding as a `bitcoin-block` multicodec. This process is reversable, see [`cidToHash`](#cidToHash).

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash and `bitcoin-block` multicodec registered

**Return value**  _(`object`)_: a CID (`multiformats.CID`) object representing this block identifier.

<a name="txHashToCID"></a>
### `txHashToCID(multiformats)`

Convert a Bitcoin transaction identifier (hash) to a CID. The identifier should be in big-endian form as typically understood by Bitcoin applications.

The process of converting to a CID involves reversing the hash (to little-endian form), encoding as a `dbl-sha2-256` multihash and encoding as a `bitcoin-tx` multicodec. This process is reversable, see [`cidToHash`](#cidToHash).

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash and `bitcoin-tx` multicodec registered

**Return value**  _(`object`)_: A CID (`multiformats.CID`) object representing this transaction identifier.

## License

Licensed under either of

 * Apache 2.0, ([LICENSE-APACHE](LICENSE-APACHE) / http://www.apache.org/licenses/LICENSE-2.0)
 * MIT ([LICENSE-MIT](LICENSE-MIT) / http://opensource.org/licenses/MIT)

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
