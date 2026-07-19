import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {BarChart} from '../components/BarChart';
import {FlipClock} from '../components/FlipClock';
import type {DialogueLineScript} from '../schema';
import {TOKENS} from '../tokens';
import {FactCard, PhoneFrame, Waveform, relativeProgress} from './EducationalShared';
import {SceneField} from './shared';

const visualPhrase = (visual: string) => visual
  .replace(/\b(bar|chart|counter|count|card|phone|mobile|waveform|mic|microphone)\b/gi, '')
  .replace(/\s+/g, ' ')
  .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
  .trim();

const VisualBeat = ({line, frame, duration}: {line: DialogueLineScript; frame: number; duration: number}) => {
  const visual = line.visual.toLowerCase();
  const phrase = (visualPhrase(line.visual) || line.text).toUpperCase();
  const draw = relativeProgress(frame, duration, .08, .72);

  if (/\b(chart|bars?)\b/.test(visual)) {
    return (
      <div style={{width: 888, marginLeft: line.speaker === 'jessica' ? 0 : -108, transform: 'scale(.84)', transformOrigin: line.speaker === 'jessica' ? 'left bottom' : 'right bottom'}}>
        <BarChart data={[
          {label: 'ONE', value: 34},
          {label: 'TWO', value: 82},
          {label: 'PACE', value: 61},
          {label: 'STYLE', value: 74},
          {label: 'FLOW', value: 92},
        ]} />
      </div>
    );
  }

  if (/\b(counter|count|number|score|clock)\b/.test(visual)) {
    const authoredNumber = line.visual.match(/\b\d{1,3}\b/)?.[0] ?? String(line.speaker === 'jessica' ? 1 : 2).padStart(2, '0');
    return (
      <div style={{padding: '74px 44px 64px', borderTop: `3px solid ${TOKENS.color.pending}`, borderBottom: `3px solid ${TOKENS.color.boneHairline}`}}>
        <FlipClock label={authoredNumber} compact />
        <div style={{marginTop: 44, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 22, fontWeight: 700, textAlign: 'center', letterSpacing: '.16em'}}>{phrase.slice(0, 46)}</div>
      </div>
    );
  }

  if (/\b(phone|mobile|waveform|mic|microphone|audio)\b/.test(visual)) {
    return (
      <PhoneFrame width={510} height={690} glow>
        <div style={{position: 'absolute', left: 42, right: 42, top: 100, height: 210}}>
          <Waveform progress={draw} />
        </div>
        <div style={{position: 'absolute', left: 44, right: 44, top: 354, paddingTop: 28, borderTop: `3px solid ${TOKENS.color.pending}`}}>
          <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 19, fontWeight: 700, letterSpacing: '.14em'}}>LIVE / {line.speaker.toUpperCase()}</div>
          <div style={{marginTop: 24, fontFamily: TOKENS.font.display, color: TOKENS.color.bone, fontSize: 43, lineHeight: .98, letterSpacing: '-.035em'}}>{phrase.slice(0, 54)}</div>
        </div>
      </PhoneFrame>
    );
  }

  if (/\b(card|receipt|panel|tile)\b/.test(visual)) {
    return (
      <FactCard number={String(line.speaker === 'jessica' ? 1 : 2)} label={`${line.speaker.toUpperCase()} / VISUAL BEAT`}>
        <div style={{position: 'absolute', left: 34, right: 34, bottom: 34, fontFamily: TOKENS.font.display, fontSize: 48, lineHeight: .94, letterSpacing: '-.035em'}}>{phrase.slice(0, 58)}</div>
      </FactCard>
    );
  }

  return (
    <div style={{position: 'relative', minHeight: 390, boxSizing: 'border-box', padding: '56px 58px', border: `4px solid ${TOKENS.color.pending}`, borderRadius: TOKENS.radius.card, background: TOKENS.color.bone, color: TOKENS.color.ink, boxShadow: `18px 18px 0 ${TOKENS.color.pendingSoft}`, overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: 26, right: 28, fontFamily: TOKENS.font.mono, fontSize: 18, letterSpacing: '.14em'}}>KINETIC / TYPE</div>
      <div style={{marginTop: 52, fontFamily: TOKENS.font.display, fontSize: 65, lineHeight: .9, letterSpacing: '-.05em', transform: `translateX(${interpolate(draw, [0, 1], [line.speaker === 'jessica' ? -70 : 70, 0])}px)`, opacity: draw}}>{phrase.slice(0, 72)}</div>
      <div style={{position: 'absolute', left: 0, right: `${100 - draw * 100}%`, bottom: 0, height: 14, background: TOKENS.color.pending}} />
    </div>
  );
};

export const EduDialogueScene = ({
  duration,
  line,
  lineIndex,
  frameOverride,
}: {
  duration: number;
  line: DialogueLineScript;
  lineIndex: number;
  frameOverride?: number;
}) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const jessica = line.speaker === 'jessica';
  const enter = spring({frame, fps, config: {damping: 15, stiffness: 170, mass: .78}});
  const bias = jessica ? 'left' : 'right';
  return (
    <SceneField>
      <div style={{position: 'absolute', top: 112, left: 96, right: 96, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 18}}>
        <div style={{width: 42, height: 8, background: TOKENS.color.pending}} />
        <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 22, fontWeight: 700, letterSpacing: '.17em'}}>{String(lineIndex + 1).padStart(2, '0')} / {line.speaker.toUpperCase()}</div>
        <div style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
      </div>
      <div style={{position: 'absolute', top: 235, left: jessica ? 96 : 178, right: jessica ? 178 : 96, fontFamily: TOKENS.font.display, fontSize: 69, lineHeight: .92, letterSpacing: '-.048em', textAlign: bias, textTransform: 'uppercase', transform: `translateX(${interpolate(enter, [0, 1], [jessica ? -90 : 90, 0])}px)`, opacity: enter}}>
        {line.text}
      </div>
      <div style={{position: 'absolute', top: 620, left: jessica ? 96 : 204, right: jessica ? 204 : 96, minHeight: 500, display: 'flex', justifyContent: jessica ? 'flex-start' : 'flex-end', alignItems: 'center', transform: `translateY(${interpolate(enter, [0, 1], [100, 0])}px) rotate(${interpolate(enter, [0, 1], [jessica ? -2 : 2, 0])}deg)`, opacity: enter}}>
        <div style={{width: '100%'}}><VisualBeat line={line} frame={frame} duration={duration} /></div>
      </div>
      <div style={{position: 'absolute', left: jessica ? 96 : undefined, right: jessica ? undefined : 96, top: 1395, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 14, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 19, letterSpacing: '.15em'}}>
        <span style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: jessica ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontWeight: 800, letterSpacing: 0}}>{jessica ? 'J' : 'G'}</span>
        <span>{bias.toUpperCase()} CHANNEL / ACTIVE</span>
      </div>
    </SceneField>
  );
};
