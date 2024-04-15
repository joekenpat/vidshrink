import { GluegunCommand, GluegunFilesystem } from 'gluegun'

import * as Ffmpeg from 'fluent-ffmpeg'
import * as logo from 'asciiart-logo'
import { Toolbox } from 'gluegun/build/types/domain/toolbox'
import * as fs from 'fs'

interface VideoCompressionResult {
  inputFileName: string
  outputFilename: string
  reductionPercentage: number
  inputFileSizeMB: number
  outputFileSizeMB: number
}

const ALLOWED_VIDEO_TYPES = ['mp4', 'mov', 'avi', 'mkv']

const printSplashScreenContent = (toolbox: Toolbox) =>
  toolbox.print.muted(
    logo({
      name: 'VidShrink',
      font: 'NScript',
      lineChars: 10,
      padding: 2,
      margin: 1,
      logoColor: 'bold-green',
      textColor: 'green',
      borderColor: 'green',
    })
      .center('v' + toolbox.meta.version())
      .center('Video compressor powered by FFMpeg')
      .center('Made with ❤️ by: ' + toolbox.meta.packageJSON().author)
      .render()
  )

const getPathOfVideoFilesInCurrentDirectory = (
  filesystem: GluegunFilesystem
) => {
  const files = filesystem.list(process.cwd())
  return files.filter((file) => {
    const fileExt = file.split('.').pop()

    return ALLOWED_VIDEO_TYPES.includes(fileExt)
  })
}

const questions = (toolbox: Toolbox) => {
  const videosInCurrentPath = getPathOfVideoFilesInCurrentDirectory(
    toolbox.filesystem
  )

  if (videosInCurrentPath.length === 0) {
    const errMsg =
      'No video files found in the current directory, with the following extensions: ' +
      ALLOWED_VIDEO_TYPES.join(', ')
    toolbox.print.error(errMsg)
    process.exit(1)
  }

  return toolbox.prompt.ask([
    {
      message: 'Select the video file you want to compress',
      type: 'autocomplete',
      name: 'fileFullName',
      choices: getPathOfVideoFilesInCurrentDirectory(toolbox.filesystem),
    },
    {
      message: 'Enter a suffix for compressed file',
      type: 'input',
      name: 'fileSuffix',
      initial: '_compressed',
    },
  ])
}

const buildOutputFilename = (
  fileFullName: string,
  fileSuffix: string
): string => {
  const fileNameWithoutExt = fileFullName.split('.').slice(0, -1)
  return `${fileNameWithoutExt}${fileSuffix}.mp4`
}

const computeProgressIndicatorLabel = (totalTime: number, time: number) => {
  const timeLeft = totalTime - time
  const timeLeftStr = `${Math.floor(timeLeft / 60)}m:${timeLeft % 60}s`
  const percent = ((time / totalTime) * 100).toFixed(2)
  return `Compressing video ETA: ${timeLeftStr} | ${percent}%`
}

const getFileReductionStats = (
  inputFileName: string,
  outputFileName: string
) => {
  const byteToMB = (bytes: number) => bytes / 1024 / 1024
  const inputFileSize = fs.readFileSync(inputFileName).byteLength
  const outputFileSize = fs.readFileSync(outputFileName).byteLength
  const percentage = ((inputFileSize - outputFileSize) / inputFileSize) * 100

  return {
    inputFileSizeMB: byteToMB(inputFileSize),
    outputFileSizeMB: byteToMB(outputFileSize),
    reductionPercentage: percentage,
  }
}

const processVideo = (
  inputFileName: string,
  fileSuffix: string,
  toolbox: Toolbox
): Promise<VideoCompressionResult> => {
  return new Promise((resolve, reject) => {
    const outputFilename = buildOutputFilename(inputFileName, fileSuffix)
    const progressIndicator = toolbox.print.spin('Compressing video...')
    let totalTime = 0

    Ffmpeg(inputFileName)
      .outputOptions('-q:v 0')
      .output(outputFilename)
      .on('codecData', (data) => {
        progressIndicator.start()
        totalTime = parseInt(data.duration.replace(/:/g, ''))
        progressIndicator.text = computeProgressIndicatorLabel(totalTime, 0)
      })
      .on('progress', (progress) => {
        const time = parseInt(progress.timemark.replace(/:/g, ''))
        progressIndicator.text = computeProgressIndicatorLabel(totalTime, time)
      })
      .on('error', (err) => {
        progressIndicator.fail(err.message)
        reject(err)
      })
      .on('end', () => {
        progressIndicator.succeed('Compressing completed!')
        const reductionStats = getFileReductionStats(
          inputFileName,
          outputFilename
        )

        resolve({
          inputFileName,
          outputFilename,
          ...reductionStats,
        })
      })
      .run()
  })
}

const command: GluegunCommand = {
  name: 'vidshrink',
  run: async (toolbox) => {
    const { print, system } = toolbox

    if (system.which('ffmpeg') === null) {
      print.error(
        'FFMpeg is not installed. Please install it before running VidShrink'
      )
      process.exit()
    }

    printSplashScreenContent(toolbox)

    try {
      const { fileFullName, fileSuffix } = await questions(toolbox)
      const result = await processVideo(fileFullName, fileSuffix, toolbox)
      const successMsg = `Video compressed successfully! 🎉
      Input file: ${result.inputFileName}[${result.inputFileSizeMB.toFixed(
        2
      )}MB]
      Output file: ${result.outputFilename}[${result.outputFileSizeMB.toFixed(
        2
      )}MB]
      Reduction percentage: ${result.reductionPercentage.toFixed(2)}%`

      print.success(successMsg)
      process.exit()
    } catch (err: unknown) {
      print.error(err)
      process.exit()
    }
  },
}

module.exports = command
