'use strict'

const uint8ArrayFromString = require('uint8arrays/from-string')

const BITCOIN_BLOCK_HEADER_SIZE = require('../src/index')
  .util.BITCOIN_BLOCK_HEADER_SIZE

const headerFromHexBlock = (hex) => {
  return uint8ArrayFromString(hex.toString(), 'base16').slice(0, BITCOIN_BLOCK_HEADER_SIZE)
}

module.exports = {
  headerFromHexBlock
}
