const user = getAddress()

const uploadHeartRateData = async ({ heartRateDataFile, workoutSignature }) => {
  await deleteOldFiles() // TODO

  const heartRateDataStoragePath = await uploadToChain(heartRateDataFile) // TODO

  await juriNetworkProxyContract.methods
    .addHeartRateDateForPoolUser(
      user,
      workoutSignature,
      heartRateDataStoragePath
    )
    .send()
}

const runRound = async () => {
  await uploadHeartRateData({ heartRateDataFile, workoutSignature })
}

module.exports = runRound
