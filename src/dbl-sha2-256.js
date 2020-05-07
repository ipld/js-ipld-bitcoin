const { dblSha2256 } = require('bitcoin-block')
const CODEC = 'dbl-sha2-256'
const CODEC_CODE = 0x56

module.exports = {
  encode: dblSha2256,
  name: CODEC,
  code: CODEC_CODE
}
