const createProxyContract = contract => {
  const handler = {
    get: (target, prop) => async (...args) => {
      const result = await target[prop].apply(this, args)

      console.log(prop + JSON.stringify(args) + ' -> ' + JSON.stringify(result))

      return result
    },
  }

  return new Proxy(contract, handler)
}

module.exports = { createProxyContract }
