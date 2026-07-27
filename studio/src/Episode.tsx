import type {CSSProperties} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Captions} from './components/Captions';
import type {DialogueLineScript, EpisodeFormat, EpisodeProps, ResolvedCue, SceneScript} from './schema';
import {CallOneScene} from './scenes/CallOneScene';
import {CallThreeScene} from './scenes/CallThreeScene';
import {CallTwoScene} from './scenes/CallTwoScene';
import {HookScene} from './scenes/HookScene';
import {LoopScene} from './scenes/LoopScene';
import {ReceiptScene} from './scenes/ReceiptScene';
import {EduCloudScene} from './scenes/EduCloudScene';
import {EduEverywhereScene} from './scenes/EduEverywhereScene';
import {EduHookScene} from './scenes/EduHookScene';
import {EduOutroScene} from './scenes/EduOutroScene';
import {EduPrivacyScene} from './scenes/EduPrivacyScene';
import {EduShrinkScene} from './scenes/EduShrinkScene';
import {EduDialogueScene} from './scenes/EduDialogueScene';
import {longShotImpactFrame, receiptStampFrame, receiptTickFrame} from './scenes/beats';
import {resolveThemeTokens} from './tokens';

const amplitude = (db: number) => Math.pow(10, db / 20);
const msToFrame = (ms: number) => Math.round((ms / 1000) * 30);

const SceneForCue = ({cue, duration, scene, line, format, eyebrow}: {cue: ResolvedCue; duration: number; scene?: SceneScript; line?: DialogueLineScript; format: EpisodeFormat; eyebrow: string}) => {
  if (scene?.type === 'edu-dialogue' && line) {
    return <EduDialogueScene duration={duration} line={line} lineIndex={cue.lineIndex ?? 0} format={format} eyebrow={eyebrow} />;
  }
  if (scene?.type === 'edu-hook') return <EduHookScene duration={duration} />;
  if (scene?.type === 'edu-cloud') return <EduCloudScene duration={duration} />;
  if (scene?.type === 'edu-shrink') return <EduShrinkScene duration={duration} />;
  if (scene?.type === 'edu-privacy') return <EduPrivacyScene duration={duration} />;
  if (scene?.type === 'edu-everywhere') return <EduEverywhereScene duration={duration} />;
  if (scene?.type === 'edu-outro') return <EduOutroScene duration={duration} />;
  if (cue.id === 'hook') return <HookScene />;
  if (cue.id === 'receipt') return <ReceiptScene duration={duration} />;
  if (cue.id === 'call-1') return <CallOneScene duration={duration} />;
  if (cue.id === 'call-2') return <CallTwoScene duration={duration} />;
  if (cue.id === 'call-3') return <CallThreeScene duration={duration} />;
  return <LoopScene duration={duration} />;
};

const Soundtrack = ({assetBase, audioFile, enableSfx, cues}: {assetBase: string; audioFile: string; enableSfx: boolean; cues: ResolvedCue[]}) => {
  if (!assetBase) return null;
  const frames = cues.map((cue) => ({cue, start: msToFrame(cue.startMs), end: msToFrame(cue.endMs)}));
  const receipt = frames.find(({cue}) => cue.id === 'receipt');
  const callThree = frames.find(({cue}) => cue.id === 'call-3');
  const shrink = frames.find(({cue}) => cue.id === 'shrink');
  const privacy = frames.find(({cue}) => cue.id === 'privacy');
  const everywhere = frames.find(({cue}) => cue.id === 'everywhere');
  const whooshFrames = [5, ...frames.slice(1).map(({start}) => start)];
  return (
    <>
      <Audio src={staticFile(`${assetBase}/${audioFile}`)} volume={1} />
      {enableSfx ? whooshFrames.map((from, index) => (
        <Sequence key={`whoosh-${index}`} from={from} durationInFrames={12} layout="none">
          <Audio src={staticFile('generated/sfx/whoosh.wav')} volume={amplitude(-16)} />
        </Sequence>
      )) : null}
      {enableSfx && receipt ? (
        <>
          <Sequence from={receipt.start + receiptStampFrame(receipt.end - receipt.start) + 4} durationInFrames={16} layout="none">
            <Audio src={staticFile('generated/sfx/bass.wav')} volume={amplitude(-6)} />
          </Sequence>
          <Sequence from={receipt.start + receiptTickFrame(receipt.end - receipt.start)} durationInFrames={8} layout="none">
            <Audio src={staticFile('generated/sfx/tick.wav')} volume={0.12} />
          </Sequence>
        </>
      ) : null}
      {enableSfx && callThree ? (
        <Sequence from={callThree.start + longShotImpactFrame(callThree.end - callThree.start)} durationInFrames={16} layout="none">
          <Audio src={staticFile('generated/sfx/bass.wav')} volume={amplitude(-6)} />
        </Sequence>
      ) : null}
      {enableSfx && shrink ? (
        <Sequence from={shrink.start + Math.round((shrink.end - shrink.start) * .58)} durationInFrames={16} layout="none">
          <Audio src={staticFile('generated/sfx/bass.wav')} volume={amplitude(-10)} />
        </Sequence>
      ) : null}
      {enableSfx && privacy ? (
        <Sequence from={privacy.start + Math.round((privacy.end - privacy.start) * .59)} durationInFrames={8} layout="none">
          <Audio src={staticFile('generated/sfx/tick.wav')} volume={0.14} />
        </Sequence>
      ) : null}
      {enableSfx && everywhere ? [0.06, .32, .57].map((ratio, index) => (
        <Sequence key={`fact-tick-${index}`} from={everywhere.start + Math.round((everywhere.end - everywhere.start) * ratio)} durationInFrames={8} layout="none">
          <Audio src={staticFile('generated/sfx/tick.wav')} volume={0.12} />
        </Sequence>
      )) : null}
    </>
  );
};

export const Episode = ({episode, timing, assetBase, audioFile = 'vo.wav', enableSfx = true}: EpisodeProps) => {
  const frame = useCurrentFrame();
  const theme = resolveThemeTokens(episode.theme);
  const themeStyle = {
    '--episode-accent': theme.accent,
    '--episode-accent-soft': theme.accentSoft,
    '--episode-accent-soft-solid': theme.accentSoftSolid,
  } as CSSProperties;
  const firstCue = timing.cues[0];
  const firstDuration = firstCue ? Math.max(1, Math.min(timing.durationInFrames, msToFrame(firstCue.endMs)) - msToFrame(firstCue.startMs)) : 1;
  const educational = episode.scenes[0]?.type === 'edu-hook';
  const dialogue = episode.scenes[0]?.type === 'edu-dialogue' && Boolean(episode.lines?.[0]);
  const eyebrow = episode.eyebrow ?? episode.title.toUpperCase();
  return (
    <AbsoluteFill style={themeStyle}>
      {timing.cues.map((cue) => {
        const scene = episode.scenes.find((candidate) => candidate.id === cue.id);
        const lineIndex = cue.lineIndex ?? (typeof scene?.lineIndex === 'number' ? scene.lineIndex : undefined);
        const line = lineIndex === undefined ? undefined : episode.lines?.[lineIndex];
        const start = msToFrame(cue.startMs);
        const end = Math.min(timing.durationInFrames, msToFrame(cue.endMs));
        const duration = Math.max(1, end - start);
        return (
          <Sequence key={cue.id} from={start} durationInFrames={duration} name={cue.id}>
            <SceneForCue cue={cue} duration={duration} scene={scene} line={line} format={episode.format} eyebrow={eyebrow} />
          </Sequence>
        );
      })}
      <Captions pages={timing.captions} theme={episode.theme} format={episode.format} />
      <Soundtrack assetBase={assetBase} audioFile={audioFile} enableSfx={enableSfx} cues={timing.cues} />
      {frame === timing.durationInFrames - 1 ? (
        <AbsoluteFill style={{zIndex: 999}}>
          {dialogue ? (
            <EduDialogueScene duration={firstDuration} line={episode.lines![0]} lineIndex={0} format={episode.format} eyebrow={eyebrow} frameOverride={0} />
          ) : educational ? (
            <EduHookScene duration={firstDuration} frameOverride={0} />
          ) : (
            <HookScene frameOverride={0} />
          )}
          <Captions pages={timing.captions} theme={episode.theme} format={episode.format} frameOverride={0} />
        </AbsoluteFill>
      ) : null}
      <div style={{display: 'none'}}>{episode.title}</div>
    </AbsoluteFill>
  );
};
