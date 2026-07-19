import {Composition} from 'remotion';
import {Episode} from './Episode';
import type {EpisodeProps} from './schema';
import {CANVAS} from './tokens';

const defaultProps: EpisodeProps = {
  episode: {
    id: 'preview',
    title: 'CALLED IT. PREVIEW',
    voice: {name: 'Samantha', rate: 182},
    narration: '',
    scenes: [
      {id: 'hook', type: 'hook', cue: 'Thirteen days'},
      {id: 'receipt', type: 'receipt', cue: 'First, we grade'},
      {id: 'call-1', type: 'call-1', cue: 'Champions who win'},
      {id: 'call-2', type: 'call-2', cue: 'Call two'},
      {id: 'call-3', type: 'call-3', cue: 'Call three'},
      {id: 'loop', type: 'loop', cue: 'Clip this'},
    ],
  },
  timing: {
    durationMs: 36360,
    durationInFrames: 1091,
    words: [],
    captions: [],
    cues: [
      {id:'hook',cue:'Thirteen days',startMs:0,endMs:3500,score:1,matchedText:'',fallback:false},
      {id:'receipt',cue:'First, we grade',startMs:3500,endMs:9000,score:1,matchedText:'',fallback:false},
      {id:'call-1',cue:'Champions who win',startMs:9000,endMs:16500,score:1,matchedText:'',fallback:false},
      {id:'call-2',cue:'Call two',startMs:16500,endMs:23000,score:1,matchedText:'',fallback:false},
      {id:'call-3',cue:'Call three',startMs:23000,endMs:30000,score:1,matchedText:'',fallback:false},
      {id:'loop',cue:'Clip this',startMs:30000,endMs:36360,score:1,matchedText:'',fallback:false},
    ],
  },
  assetBase: '',
};

export const RemotionRoot = () => (
  <Composition
    id="CalledItEpisode"
    component={Episode}
    width={CANVAS.width}
    height={CANVAS.height}
    fps={CANVAS.fps}
    durationInFrames={defaultProps.timing.durationInFrames}
    defaultProps={defaultProps}
    calculateMetadata={({props}) => ({
      durationInFrames: props.timing.durationInFrames,
      fps: CANVAS.fps,
      width: CANVAS.width,
      height: CANVAS.height,
      props,
      defaultCodec: 'h264',
      defaultPixelFormat: 'yuv420p',
    })}
  />
);
