/* eslint-disable linebreak-style */
/* eslint-disable no-useless-catch */
/* eslint-disable space-before-function-paren */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const fs = require("fs");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const os = require("os");
const axios = require("axios");
const https = require("https");
const twitterdl = require("./twitterdl.js");
const ffmpegExec = require("./ffmpeg.js");

// get temp directory
const tempDir = os.tmpdir();

const MAX_VIDEO_SEC = 20 * 60;
const MAX_VIDEO_MS = 20 * 60 * 1000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MIN_REQ_MEMORY_BYTES = 64 * 1024 * 1024;

if ("win32" == os.platform()) {
  ffmpeg.setFfmpegPath(
    process.env.LOCALAPPDATA +
      "/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-6.0-full_build/bin/ffmpeg.exe"
  );
}

const debugEnabled = true;
log = (str) => {
  if (debugEnabled) console.debug("cmd::videoedit: " + str);
};

// final output will return a file path in the temp folder,
async function downloadVideo(videoUrl, videoStartTime, videoEndTime, ffmpegOpts, callback) {
  if (os.freemem() < MIN_REQ_MEMORY_BYTES) {
    throw new Error("Not enough memory available on the machine.");
  }
  videoEndTime = videoEndTime == 0 ? MAX_VIDEO_SEC : videoEndTime
  const timestamp = new Date().getTime();
  const videoOutputPath = `${tempDir}/video_${timestamp}.mp4`;
  const finalOutputPath = `${tempDir}/final_${timestamp}.mp4`;

  if (videoStartTime < 0 || videoEndTime <= videoStartTime) {
    throw new Error("Invalid time range");
  }
  try {
    const isVideoTwitter = twitterdl.isTwitterStatusUrl(videoUrl);
    let isVideoUrlMp4 = false;
    if (!isVideoTwitter) {
      isVideoUrlMp4 = await isUrlMP4(videoUrl)
    }
    let videoPromise = null;
    if (isVideoTwitter) {
      videoPromise = twitterdl.downloadTwitterVideoAsync(videoUrl, videoOutputPath);
    } else if (isVideoUrlMp4) {
      videoPromise = downloadMp4UrlAsync(videoUrl, videoOutputPath);
    } else {
      videoPromise = downloadYoutubeBothAsync(videoUrl, videoOutputPath);
    }

    await Promise.all([videoPromise])

    log("video downloaded");

    const needsMidProcess = !(videoStartTime == 0 && videoEndTime == MAX_VIDEO_SEC)
    if(needsMidProcess){
      const videoDuration = videoEndTime - videoStartTime;
      // Use fluent-ffmpeg to merge the video and audio files
      await new Promise((resolve,reject) => {
        if(ffmpegOpts==""){
          ffmpeg()
          .addInput(videoOutputPath)
          .seekInput(videoStartTime) // start time in seconds
          .addOptions(`-t ${videoDuration}`) // duration in seconds
          .output(finalOutputPath)
          .addOption("-c copy") // no encoding!!
          .addOptions("-threads 4")
          .on("end", resolve)
          .on("error", reject)
          .run();
        }else{
          // TODO: hayvan gibi güvnelik açığı lan bu, buna sonra bak
          ffmpeg()
          .addInput(videoOutputPath)
          .seekInput(videoStartTime) // start time in seconds
          .addOptions(`-t ${videoDuration}`) // duration in seconds
          .output(finalOutputPath)
          .addOption("-c copy") // no encoding!!
          .addOptions("-threads 4")
          .on("end", resolve)
          .on("error", reject)
          .run();
        }
      });
    }else {
      fs.rename(videoOutputPath, finalOutputPath, (err)=>{})
    }

    log("final output ready");
    await callback(finalOutputPath);
  } catch (err) {
    throw err;
  } finally {
    // clean up files
    fs.unlink(videoOutputPath, function (err) {});
    fs.unlink(finalOutputPath, function (err) {});
    log("cleaned up files");
  }
}

// final output will return a file path in the temp folder,
// user of this function has to clean up the
async function downloadVideoAndAudioEdit(
  videoUrl,
  audioUrl,
  videoStartTime,
  videoEndTime,
  audioStartTime,
  audioEndTime,
  callback
) {
  if (os.freemem() < MIN_REQ_MEMORY_BYTES) {
    throw new Error("Not enough memory available on the machine.");
  }

  const timestamp = new Date().getTime();
  const videoOutputPath = `${tempDir}/video_${timestamp}.mp4`;
  const audioOutputPath = `${tempDir}/audio_${timestamp}.mp4`;
  const finalOutputPath = `${tempDir}/final_${timestamp}.mp4`;

  const midProcessVideoOutputPath = `${tempDir}/video_mid_${timestamp}.mp4`;
  const midProcessAudioOutputPath = `${tempDir}/audio_mid_${timestamp}.mp4`;

  // Validate time ranges
  if (
    videoStartTime < 0 ||
    videoEndTime <= videoStartTime ||
    audioStartTime < 0 ||
    audioEndTime <= audioStartTime
  ) {
    throw new Error("Invalid time range");
  }
  try {
    let promises = [];
    const isVideoTwitter = twitterdl.isTwitterStatusUrl(videoUrl);
    const isAudioTwitter = twitterdl.isTwitterStatusUrl(audioUrl);
    log(
      "isVideoTwitter:" + isVideoTwitter + ", isAudioTwitter:" + isAudioTwitter
    );

    let isVideoUrlMp4 = false;
    let isAudioUrlMp4 = false;
    if (!isVideoTwitter || !isAudioTwitter) {
      const pRes = await Promise.all([isUrlMP4(videoUrl), isUrlMP4(audioUrl)]);
      isVideoUrlMp4 = pRes[0];
      isAudioUrlMp4 = pRes[1];
    }
    log("isVideoUrlMp4:" + isVideoUrlMp4 + ", isAudioUrlMp4:" + isAudioUrlMp4);

    let videoNeedsMidProcess = isVideoUrlMp4 || isVideoTwitter;
    let audioNeedsMidProcess = isAudioUrlMp4 || isAudioTwitter;

    let videoPromise = null;
    if (isVideoTwitter) {
      videoPromise = twitterdl.downloadTwitterVideoAsync(videoUrl, videoOutputPath);
    } else if (isVideoUrlMp4) {
      videoPromise = downloadMp4UrlAsync(videoUrl, videoOutputPath);
    } else {
      videoPromise = downloadYoutubeVideoAsync(videoUrl, videoOutputPath);
    }
    log("video promise created");

    if (isAudioTwitter) {
      audioPromise = twitterdl.downloadTwitterVideoAsync(audioUrl, audioOutputPath);
    } else if (isAudioUrlMp4) {
      audioPromise = downloadMp4UrlAsync(audioUrl, audioOutputPath);
    } else {
      audioPromise = downloadYoutubeAudioAsync(audioUrl, audioOutputPath);
    }
    log("audio promise created");

    // wait for the audio file download to finish
    await Promise.all([videoPromise, audioPromise]);
    log("videos are downloaded");

    // middle processing
    // 1. remove audio from the video
    // 2. write it to a temp file
    // 3. delete old file
    // 4. rename new file to old file
    // 5. vice-versa for audio file
    promises = [];
    if (videoNeedsMidProcess) {
      promises.push(removeAudio(videoOutputPath, midProcessVideoOutputPath));
    }

    if (audioNeedsMidProcess) {
      // if there is no audio use video file
      // const processPath = didAudioDownload ? audioOutputPath : videoOutputPath;
      promises.push(removeVideo(audioOutputPath, midProcessAudioOutputPath));
    }

    if (promises.length > 0) {
      log("mid process start");
      await Promise.all(promises);
      log("mid process ended");

      if (videoNeedsMidProcess) {
        await fs.unlink(videoOutputPath, (err)=>{});
        fs.renameSync(midProcessVideoOutputPath, videoOutputPath);
        log("deleted unprocessed video");
      }

      if (audioNeedsMidProcess) {
        await fs.unlink(audioOutputPath, (err)=>{});
        fs.renameSync(midProcessAudioOutputPath, audioOutputPath);
        log("deleted unprocessed audio");
      }
    }

    //-i 1.mp4 -ss 0 -t 10 -i 2.mp4 -ss 0 -t 10 -c:v copy -c:a aac -map 0:v -map 1:a output.mp4
    const videoDuration = videoEndTime - videoStartTime;
    const audioDuration = audioEndTime - audioStartTime;
    const shortest = Math.min(videoDuration, audioDuration)
    // Use fluent-ffmpeg to merge the video and audio files
    await new Promise((resolve, reject) => {
      const command = ffmpeg()
        //.addOptions(` -i ${videoOutputPath} -map 0  -ss ${videoStartTime} -t ${shortest} -i ${audioOutputPath} -map 1  -ss ${audioStartTime} -t ${shortest} -map 0:v -map 1:a -c:v copy -c:a copy -threads 4`)
        //.addOptions(` -i ${videoOutputPath} -ss ${videoStartTime} -t ${shortest} -i ${audioOutputPath} -ss ${audioStartTime} -t ${shortest} -c:v copy -c:a aac -map 0:v -map 1:a -threads 4`)
        .addInput(videoOutputPath)
        .seekInput(videoStartTime) // start time in seconds
        .addInputOptions(`-t ${shortest}`) // duration in seconds
        .addInput(audioOutputPath)
        .seekInput(audioStartTime) // start time in seconds
        .addInputOptions(`-t ${shortest}`) // duration in seconds
        .addOptions("-threads 4")
        .output(finalOutputPath)
        .on("end", resolve)
        .on("error", reject)
      console.log(command._getArguments().join(' '));
      command.run();
    });

    log("final output ready");
    await callback(finalOutputPath);
  } catch (err) {
    throw err;
  } finally {
    // clean up files
    fs.unlink(videoOutputPath, function (err) {});
    fs.unlink(audioOutputPath, function (err) {});
    fs.unlink(finalOutputPath, function (err) {});
    fs.unlink(midProcessAudioOutputPath, function (err) {});
    fs.unlink(midProcessVideoOutputPath, function (err) {});
    log("cleaned up files");
  }
}

function isUrlMP4(url) {
  return new Promise((resolve) => {
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const contentType = response.headers["content-type"];
        if (
          contentType &&
          (contentType.includes("video/mp4") ||
            contentType.includes("video/webm") ||
            contentType.includes("video/ogg") ||
            contentType.includes("audio/mpeg") ||
            contentType.includes("audio/aac") ||
            contentType.includes("audio/ogg") ||
            contentType.includes("audio/flac") ||
            contentType.includes("audio/wav"))
        ) {
          resolve(true);
        } else {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  });
}

////////////////////////////////////////////////////////////
//////   MidProccess  //////////////////////////////////////
////////////////////////////////////////////////////////////

// turn video to audio only file
async function removeVideo(inputFilePath, outputFilePath) {
  const args = `-y -i ${inputFilePath} -vn -c:a aac -threads 4 ${outputFilePath}`
  const err = await ffmpegExec(args)
  if (err!=null){
    return
  }
  log("Video removed successfully");
  // return new Promise((resolve, reject) => {
  //   const command = ffmpeg()
  //     .input(inputFilePath)
  //     .output(outputFilePath)
  //     .addOption("-vn") // Remove video
  //     .addOption("-c:a aac") // copy audio
  //     .addOption("-threads 4")
  //     .on("end", () => {
  //       log("Video removed, and audio extracted successfully");
  //       resolve();
  //     })
  //     .on("error", (err) => {
  //       log("Error on removeVideo: : " + err);
  //       reject(err);
  //     })
  //   console.log(command._getArguments().join(' '));
  //   command.run();
  // });
}

async function removeAudio(inputFilePath, outputFilePath) {
  const args = `-y -i ${inputFilePath} -c:v copy -an -threads 4 ${outputFilePath}`
  const err = await ffmpegExec(args)
  if (err!=null){
    return
  }
  log("Audio removed successfully");
  // return new Promise((resolve, reject) => {
  //   const command = ffmpeg()
  //     .input(inputFilePath)
  //     .output(outputFilePath)
  //     .addOption("-c:v copy") // Copy video codec
  //     .addOption("-an") // Remove audio from the video
  //     .addOption("-threads 4")
  //     .on("end", () => {
  //       log("Audio removed successfully");
  //       resolve();
  //     })
  //     .on("error", (err) => {
  //       log("Error on removeAudio: " + err);
  //       reject(err);
  //     });
  //   console.log(command._getArguments().join(' '));
  //   command.run();
  // });
}

////////////////////////////////////////////////////////////
//////   Mp4Urls    ////////////////////////////////////////
////////////////////////////////////////////////////////////

function mediaStreamToFileAsync(stream, outputPath) {
  let videoSize = 0;
  stream.on("data", (chunk) => {
    videoSize += chunk.length;
    if (videoSize > MAX_VIDEO_BYTES) {
      stream.destroy();
      throw new Error("Video file too large");
    }
  });
  const videoOutput = fs.createWriteStream(outputPath);
  stream.pipe(videoOutput);
  return new Promise((resolve) => {
    videoOutput.on("close", resolve);
  });
}

function downloadMp4UrlAsync(url, outputPath) {
  return new Promise(async (resolve) => {
    stream = (await axios.get(url, { responseType: "stream" })).data;
    await mediaStreamToFileAsync(stream, outputPath);
    resolve();
  });
}

////////////////////////////////////////////////////////////
//////   Youtube    ////////////////////////////////////////
////////////////////////////////////////////////////////////

function downloadYoutubeBothAsync(url, outputPath) {
  stream = ytdl(url, {
    filter: (format) => {
      return (
        format.hasVideo &&
        format.hasAudio &&
        format.height <= 540 &&
        format.approxDurationMs != null &&
        format.approxDurationMs < MAX_VIDEO_MS
      );
    },
  });

  return mediaStreamToFileAsync(stream, outputPath);
}

function downloadYoutubeVideoAsync(url, outputPath) {
  // Download video without audio
  stream = ytdl(url, {
    filter: (format) => {
      // Filter out video formats with a height greater than 540 pixels
      return (
        format.hasVideo &&
        !format.hasAudio &&
        format.height <= 540 &&
        format.approxDurationMs != null &&
        format.approxDurationMs < MAX_VIDEO_MS
      );
    },
  });

  return mediaStreamToFileAsync(stream, outputPath);
}

function downloadYoutubeAudioAsync(url, outputPath) {
  // Download audio only
  stream = ytdl(url, {
    filter: (format) => {
      // Filter out video formats with a height greater than 540 pixels
      return (
        !format.hasVideo &&
        format.hasAudio &&
        format.approxDurationMs != null &&
        format.approxDurationMs < MAX_VIDEO_MS
      );
    },
  });
  return mediaStreamToFileAsync(stream, outputPath);
}

module.exports = { downloadVideo, downloadVideoAndAudioEdit };

// (async ()=>{
//   console.time("total")
//   removeAudio("video_1702221583410.mp4","noA.mp4")
//   console.timeLog("total")
//   removeVideo("video_1702221583410.mp4","noV.mp4")
//   console.timeEnd("total")
// })()
