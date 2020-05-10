const { dblSha2256 } = require('bitcoin-block')
const { HASH_ALG, HASH_ALG_CODE } = require('./constants')

module.exports = {
  encode: dblSha2256,
  name: HASH_ALG,
  code: HASH_ALG_CODE
}
