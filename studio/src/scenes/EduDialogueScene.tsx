import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CompareBars} from '../components/CompareBars';
import {CountUp} from '../components/CountUp';
import {FlipClock} from '../components/FlipClock';
import {Leaderboard} from '../components/Leaderboard';
import {Meter} from '../components/Meter';
import {RangeBar} from '../components/RangeBar';
import {ScreenGrid} from '../components/ScreenGrid';
import {SplitStat} from '../components/SplitStat';
import {DepthFlow} from '../field/viz/DepthFlow';
import {FieldPlay} from '../field/viz/FieldPlay';
import {RiseRank} from '../field/viz/RiseRank';
import {SpeedRace} from '../field/viz/SpeedRace';
import {ZoneHeat} from '../field/viz/ZoneHeat';
import type {DialogueLineScript, EpisodeFormat, Viz} from '../schema';
import {TOKENS} from '../tokens';
import {relativeProgress} from './EducationalShared';
import {SceneField} from './shared';

const KineticStatement = ({text, progress}: {text: string; progress: number}) => {
  const fontSize = text.length > 76 ? 68 : text.length > 48 ? 78 : 92;
  return (
    <div style={{width: '100%', textAlign: 'center', transform: `translateY(${interpolate(progress, [0, 1], [70, 0])}px)`, opacity: progress}}>
      <div style={{maxWidth: 850, margin: '0 auto', fontFamily: TOKENS.font.display, fontSize, lineHeight: .92, letterSpacing: '-.052em', textTransform: 'uppercase', textWrap: 'balance'}}>
        {text}
      </div>
      <div style={{width: `${progress * 170}px`, height: 10, margin: '42px auto 0', background: TOKENS.color.pending, boxShadow: `0 0 24px ${TOKENS.color.pendingSoft}`}} />
    </div>
  );
};

const statValueSize = (value: string) => value.length <= 10 ? 142 : value.length <= 14 ? 108 : 76;

const StatBig = ({value, label, sub, progress, narrator}: Extract<Viz, {kind: 'statBig'}> & {progress: number; narrator: boolean}) => (
  <div style={{height: 455, boxSizing: 'border-box', position: 'relative', padding: '43px 48px', borderRadius: TOKENS.radius.card, border: `3px solid ${TOKENS.color.pending}`, background: `linear-gradient(135deg, ${TOKENS.color.pendingSoft}, rgba(13,15,20,.84) 64%)`, overflow: 'hidden', boxShadow: `0 0 36px ${TOKENS.color.pendingSoft}`}}>
    <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 20, fontWeight: 700, letterSpacing: '.12em', lineHeight: 1.15, textAlign: narrator ? 'center' : 'left', textTransform: 'uppercase', overflowWrap: 'anywhere'}}>{label}</div>
    <div style={{position: 'absolute', left: 48, right: 48, top: 96, bottom: sub ? 73 : 44, display: 'flex', alignItems: 'center', justifyContent: narrator ? 'center' : 'flex-start', color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: statValueSize(value), lineHeight: .83, letterSpacing: '-.065em', textAlign: narrator ? 'center' : 'left', whiteSpace: 'normal', overflowWrap: 'anywhere', textWrap: 'balance', transform: `translateY(${interpolate(progress, [0, 1], [70, 0])}px) scale(${.8 + progress * .2})`, transformOrigin: narrator ? 'center' : 'left center', opacity: progress, textShadow: `0 0 34px ${TOKENS.color.pendingSoft}`}}>{value}</div>
    {sub ? <div style={{position: 'absolute', left: 48, right: 48, bottom: 31, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 17, letterSpacing: '.07em', textTransform: 'uppercase'}}>{sub}</div> : null}
  </div>
);

const StructuredVisual = ({viz, progress, frame, duration, narrator}: {viz: Viz; progress: number; frame: number; duration: number; narrator: boolean}) => {
  switch (viz.kind) {
    case 'rangeBar':
      return <RangeBar label={viz.label} unit={viz.unit} low={viz.low} high={viz.high} compare={viz.compare} badge={viz.badge} progress={progress} />;
    case 'counter':
      return <CountUp label={viz.label} to={viz.to} unit={viz.unit} prefix={viz.prefix} from={viz.from} negative={viz.negative} sub={viz.sub} progress={progress} />;
    case 'statBig':
      return <StatBig {...viz} progress={progress} narrator={narrator} />;
    case 'compareBars':
      return <CompareBars unit={viz.unit} bars={viz.bars} reference={viz.reference} progress={progress} />;
    case 'leaderboard':
      return <Leaderboard rows={viz.rows} stamp={viz.stamp} progress={progress} />;
    case 'meter':
      return <Meter from={viz.from} to={viz.to} label={viz.label} progress={progress} />;
    case 'grid':
      return <ScreenGrid total={viz.total} filled={viz.filled} filledLabel={viz.filledLabel} resultLabel={viz.resultLabel} caption={viz.caption} progress={progress} />;
    case 'split':
      return <SplitStat left={viz.left} right={viz.right} stamp={viz.stamp} progress={progress} />;
    case 'fieldPlay':
      return <FieldPlay viz={viz} frame={frame} duration={duration} />;
    case 'depthFlow':
      return <DepthFlow viz={viz} frame={frame} duration={duration} />;
    case 'speedRace':
      return <SpeedRace viz={viz} frame={frame} duration={duration} />;
    case 'zoneHeat':
      return <ZoneHeat viz={viz} frame={frame} duration={duration} />;
    case 'riseRank':
      return <RiseRank viz={viz} frame={frame} duration={duration} />;
    case 'title':
      return null;
  }
};

const titleSize = (value: string) => value.length <= 10 ? 134 : value.length <= 14 ? 112 : 88;

const TitleMoment = ({viz, frame, duration, lineIndex, speaker, format, eyebrow}: {viz: Extract<Viz, {kind: 'title'}>; frame: number; duration: number; lineIndex: number; speaker: DialogueLineScript['speaker']; format: EpisodeFormat; eyebrow: string}) => {
  const reveal = relativeProgress(frame, duration, .04, .48);
  const chipReveal = relativeProgress(frame, duration, .36, .58);
  const chipStart = Math.round(duration * .34);
  const narrator = format === 'narrator';
  return (
    <SceneField>
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(145deg, ${TOKENS.color.pendingBlue} 0%, ${TOKENS.color.ink} 72%)`}} />
      <div style={{position: 'absolute', left: -90, top: 96, width: 520, height: 520, border: `90px solid ${TOKENS.color.pending}`, borderRadius: '50%', opacity: .11, transform: `scale(${.75 + reveal * .25})`}} />
      {narrator ? (
        <div style={{position: 'absolute', top: 112, left: 96, right: 96, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700, letterSpacing: '.15em', lineHeight: 1.2, textAlign: 'center', textTransform: 'uppercase'}}>{eyebrow}</div>
      ) : (
        <div style={{position: 'absolute', top: 98, left: 96, right: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: TOKENS.font.mono, color: speaker === 'jessica' ? TOKENS.color.pending : TOKENS.color.bone, fontSize: 20, fontWeight: 700, letterSpacing: '.17em'}}>
          <span style={{width: 42, height: 8, background: TOKENS.color.pending}} />
          <span style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: speaker === 'jessica' ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontSize: 21, fontWeight: 800, letterSpacing: 0}}>{speaker === 'jessica' ? 'J' : 'G'}</span>
          <span>{String(lineIndex + 1).padStart(2, '0')} / {speaker.toUpperCase()}</span>
          <span style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
        </div>
      )}
      <div style={{position: 'absolute', left: 86, right: 74, top: 330, color: TOKENS.color.bone, fontFamily: TOKENS.font.display, fontSize: titleSize(viz.big), lineHeight: .84, letterSpacing: '-.06em', textAlign: narrator ? 'center' : 'left', textTransform: 'uppercase', whiteSpace: 'normal', overflowWrap: 'anywhere', textWrap: 'balance', transform: `translateY(${interpolate(reveal, [0, 1], [130, 0])}px)`, opacity: reveal}}>
        {viz.big}
      </div>
      <div style={{position: 'absolute', left: narrator ? '50%' : 92, top: 755, width: `${reveal * 720}px`, height: 13, background: TOKENS.color.pending, boxShadow: `0 0 28px ${TOKENS.color.pendingSoft}`, transform: narrator ? 'translateX(-50%)' : undefined}} />
      {viz.sub ? <div style={{position: 'absolute', left: 96, right: narrator ? 96 : 120, top: 820, color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 30, fontWeight: 700, lineHeight: 1.22, letterSpacing: '.07em', textAlign: narrator ? 'center' : 'left', textTransform: 'uppercase', opacity: reveal}}>{viz.sub}</div> : null}
      {viz.dateChip ? (
        <div style={{position: 'absolute', left: 68, right: 68, top: 1090, padding: '37px 22px 43px', borderTop: `3px solid ${TOKENS.color.boneHairline}`, borderBottom: `3px solid ${TOKENS.color.boneHairline}`, opacity: chipReveal, transform: `translateY(${interpolate(chipReveal, [0, 1], [50, 0])}px) scale(${Math.min(1, 10 / Math.max(10, viz.dateChip.length))})`}}>
          <FlipClock label={viz.dateChip.toUpperCase()} compact frameOverride={Math.max(0, frame - chipStart)} />
        </div>
      ) : null}
    </SceneField>
  );
};

export const EduDialogueScene = ({
  duration,
  line,
  lineIndex,
  format = 'dialogue',
  eyebrow = '',
  frameOverride,
}: {
  duration: number;
  line: DialogueLineScript;
  lineIndex: number;
  format?: EpisodeFormat;
  eyebrow?: string;
  frameOverride?: number;
}) => {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const jessica = line.speaker === 'jessica';
  const enter = spring({frame, fps, config: {damping: 15, stiffness: 170, mass: .78}});
  const draw = relativeProgress(frame, duration, .08, .7);
  const hasViz = Boolean(line.viz);
  const narrator = format === 'narrator';

  if (line.viz?.kind === 'title') {
    return <TitleMoment viz={line.viz} frame={frame} duration={duration} lineIndex={lineIndex} speaker={line.speaker} format={format} eyebrow={eyebrow} />;
  }

  return (
    <SceneField>
      {narrator ? (
        <div style={{position: 'absolute', top: 112, left: 96, right: 96, color: TOKENS.color.pending, fontFamily: TOKENS.font.mono, fontSize: 20, fontWeight: 700, letterSpacing: '.15em', lineHeight: 1.2, textAlign: 'center', textTransform: 'uppercase'}}>{eyebrow}</div>
      ) : (
        <div style={{position: 'absolute', top: 112, left: 96, right: 96, height: 48, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 16}}>
          <div style={{width: 42, height: 8, background: TOKENS.color.pending}} />
          <div style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: jessica ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontFamily: TOKENS.font.mono, fontSize: 21, fontWeight: 800}}>{jessica ? 'J' : 'G'}</div>
          <div style={{fontFamily: TOKENS.font.mono, color: jessica ? TOKENS.color.pending : TOKENS.color.bone, fontSize: 22, fontWeight: 700, letterSpacing: '.17em'}}>{String(lineIndex + 1).padStart(2, '0')} / {line.speaker.toUpperCase()}</div>
          <div style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
        </div>
      )}
      <div style={{position: 'absolute', top: 270, left: 96, right: 96, height: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(enter, [0, 1], [90, 0])}px)`, opacity: enter}}>
        {hasViz ? (
          <div style={{width: '100%'}}><StructuredVisual viz={line.viz!} progress={draw} frame={frame} duration={duration} narrator={narrator} /></div>
        ) : (
          <KineticStatement text={line.text} progress={enter} />
        )}
      </div>
    </SceneField>
  );
};
