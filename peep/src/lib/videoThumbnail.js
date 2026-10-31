// Choose a real frame with visible detail, instead of accepting a black intro.
export function snapshotTimes(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return [...new Set([0.08,0.16,0.24,0.32,0.4].map(fraction =>
    Math.min(Math.max(0.05,duration * fraction), Math.max(0,duration - 0.05))))];
}
export function snapshotScore(pixels, width) {
  const luminance=[];
  for(let i=0;i<pixels.length;i+=4) luminance.push(0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2]);
  if(!luminance.length)return -Infinity;
  const mean=luminance.reduce((sum,n)=>sum+n,0)/luminance.length;
  const variance=luminance.reduce((sum,n)=>sum+(n-mean)**2,0)/luminance.length;
  const visible=luminance.filter(n=>n>12&&n<245).length/luminance.length;
  if(mean<8||mean>247||variance<24||visible<0.12)return -Infinity;
  let edges=0;
  for(let i=1;i<luminance.length;i++) if(i%width)edges+=Math.abs(luminance[i]-luminance[i-1]);
  return Math.sqrt(variance)+edges/luminance.length+visible*20;
}
export function captureVideoThumbnail(url, {signal} = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto'; video.playsInline=true;
    let finished=false,times=[],index=0,bestScore=-Infinity;
    const best=document.createElement('canvas'),sample=document.createElement('canvas');
    sample.width=64;sample.height=36;
    const timer=setTimeout(()=>finish(new Error('Video preview timed out.')),45000);
    const abort=()=>finish(new DOMException('Thumbnail capture cancelled.','AbortError'));
    function finish(error,file){
      if(finished)return;finished=true;clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
      video.onloadedmetadata=video.onseeked=video.onerror=null;
      video.removeAttribute('src');video.load();
      error?reject(error):resolve(file);
    }
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    video.onerror=()=>finish(new Error('This video cannot be previewed in the browser.'));
    video.onloadedmetadata=()=>{
      times=snapshotTimes(video.duration);
      if(!video.videoWidth||!times.length){finish(new Error('Use a direct finite video for automatic thumbnails.'));return;}
      best.width=Math.min(1280,video.videoWidth);best.height=Math.round(best.width*video.videoHeight/video.videoWidth);
      video.currentTime=times[0];
    };
    video.onseeked=()=>{
      // Let Safari display the decoded frame after seeking before sampling it.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(finished)return;
        try{
          const context=sample.getContext('2d',{willReadFrequently:true});
          context.drawImage(video,0,0,64,36);
          const score=snapshotScore(context.getImageData(0,0,64,36).data,64);
          if(score>bestScore){bestScore=score;best.getContext('2d').drawImage(video,0,0,best.width,best.height);}
          index++;
          if(index<times.length){video.currentTime=times[index];return;}
          if(!Number.isFinite(bestScore)){finish(new Error('No clear snapshot found. Choose a thumbnail manually.'));return;}
          best.toBlob(blob=>blob?finish(null,new File([blob],'episode-thumbnail.jpg',{type:'image/jpeg'})):finish(new Error('Could not capture this video.')),'image/jpeg',0.85);
        }catch{finish(new Error('The video host does not allow thumbnail capture.'));}
      }));
    };
    video.src=url;
  });
}

// Duration and frame size of a local file, read without decoding more than the
// header. Used to prefill runtime and describe the upload.
export function readVideoMetadata(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true; video.preload = 'metadata'; video.playsInline = true;
    let done = false;
    const timer = setTimeout(() => finish(new Error('Could not read the video details.')), timeoutMs);
    function finish(error, value) {
      if (done) return; done = true; clearTimeout(timer);
      video.onloadedmetadata = video.onerror = null;
      video.removeAttribute('src'); video.load();
      error ? reject(error) : resolve(value);
    }
    video.onerror = () => finish(new Error('This file cannot be previewed in the browser.'));
    video.onloadedmetadata = () => finish(null, { duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    video.src = url;
  });
}

// Snapshot whatever frame a <video> element is paused on, as a JPEG file.
export function captureCurrentFrame(video, maxWidth = 1280) {
  return new Promise((resolve, reject) => {
    if (!video?.videoWidth) { reject(new Error('Wait for the preview to load, then try again.')); return; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(maxWidth, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); }
    catch { reject(new Error('This frame cannot be captured.')); return; }
    canvas.toBlob(blob => blob ? resolve(new File([blob], 'episode-thumbnail.jpg', { type: 'image/jpeg' })) : reject(new Error('Could not capture this frame.')), 'image/jpeg', 0.85);
  });
}
