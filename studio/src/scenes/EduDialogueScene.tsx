import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CompareBars} from '../components/CompareBars';
import {CountUp} from '../components/CountUp';
import {FlipClock} from '../components/FlipClock';
import {Leaderboard} from '../components/Leaderboard';
import {Meter} from '../components/Meter';
import {RangeBar} from '../components/RangeBar';
import {ScreenGrid} from '../components/ScreenGrid';
import {SplitStat} from '../components/SplitStat';
import type {DialogueLineScript, Viz} from '../schema';
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

const StatBig = ({value, label, sub, progress}: Extract<Viz, {kind: 'statBig'}> & {progress: number}) => (
  <div style={{height: 455, boxSizing: 'border-box', position: 'relative', padding: '43px 48px', borderRadius: TOKENS.radius.card, border: `3px solid ${TOKENS.color.pending}`, background: `linear-gradient(135deg, ${TOKENS.color.pendingSoft}, rgba(13,15,20,.84) 64%)`, overflow: 'hidden', boxShadow: `0 0 36px ${TOKENS.color.pendingSoft}`}}>
    <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 20, fontWeight: 700, letterSpacing: '.17em'}}>SINGLE / STAT</div>
    <div style={{marginTop: 58, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: value.length > 10 ? 100 : 142, lineHeight: .78, letterSpacing: '-.07em', whiteSpace: 'nowrap', transform: `translateY(${interpolate(progress, [0, 1], [70, 0])}px) scale(${.8 + progress * .2})`, transformOrigin: 'left center', opacity: progress, textShadow: `0 0 34px ${TOKENS.color.pendingSoft}`}}>{value}</div>
    <div style={{position: 'absolute', left: 48, right: 48, bottom: sub ? 75 : 43, paddingTop: 21, borderTop: `4px solid ${TOKENS.color.bone}`, fontFamily: TOKENS.font.display, fontSize: 39, lineHeight: .95, letterSpacing: '-.03em', textTransform: 'uppercase'}}>{label}</div>
    {sub ? <div style={{position: 'absolute', left: 48, right: 48, bottom: 31, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 17, letterSpacing: '.07em', textTransform: 'uppercase'}}>{sub}</div> : null}
  </div>
);

const StructuredVisual = ({viz, progress}: {viz: Viz; progress: number}) => {
  switch (viz.kind) {
    case 'rangeBar':
      return <RangeBar label={viz.label} unit={viz.unit} low={viz.low} high={viz.high} compare={viz.compare} badge={viz.badge} progress={progress} />;
    case 'counter':
      return <CountUp label={viz.label} to={viz.to} unit={viz.unit} prefix={viz.prefix} from={viz.from} negative={viz.negative} sub={viz.sub} progress={progress} />;
    case 'statBig':
      return <StatBig {...viz} progress={progress} />;
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
    case 'title':
      return null;
  }
};

const TitleMoment = ({viz, frame, duration, lineIndex, speaker}: {viz: Extract<Viz, {kind: 'title'}>; frame: number; duration: number; lineIndex: number; speaker: DialogueLineScript['speaker']}) => {
  const reveal = relativeProgress(frame, duration, .04, .48);
  const chipReveal = relativeProgress(frame, duration, .36, .58);
  const chipStart = Math.round(duration * .34);
  return (
    <SceneField>
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(145deg, ${TOKENS.color.pendingBlue} 0%, ${TOKENS.color.ink} 72%)`}} />
      <div style={{position: 'absolute', left: -90, top: 96, width: 520, height: 520, border: `90px solid ${TOKENS.color.pending}`, borderRadius: '50%', opacity: .11, transform: `scale(${.75 + reveal * .25})`}} />
      <div style={{position: 'absolute', top: 98, left: 96, right: 96, display: 'flex', alignItems: 'center', gap: 16, fontFamily: TOKENS.font.mono, color: speaker === 'jessica' ? TOKENS.color.pending : TOKENS.color.bone, fontSize: 20, fontWeight: 700, letterSpacing: '.17em'}}>
        <span style={{width: 42, height: 8, background: TOKENS.color.pending}} />
        <span style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: speaker === 'jessica' ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontSize: 21, fontWeight: 800, letterSpacing: 0}}>{speaker === 'jessica' ? 'J' : 'G'}</span>
        <span>{String(lineIndex + 1).padStart(2, '0')} / {speaker.toUpperCase()}</span>
        <span style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
      </div>
      <div style={{position: 'absolute', left: 86, right: 74, top: 330, color: TOKENS.color.bone, fontFamily: TOKENS.font.display, fontSize: viz.big.length > 32 ? 92 : viz.big.length > 20 ? 111 : 134, lineHeight: .82, letterSpacing: '-.065em', textTransform: 'uppercase', transform: `translateY(${interpolate(reveal, [0, 1], [130, 0])}px)`, opacity: reveal}}>
        {viz.big}
      </div>
      <div style={{position: 'absolute', left: 92, top: 755, width: `${reveal * 720}px`, height: 13, background: TOKENS.color.pending, boxShadow: `0 0 28px ${TOKENS.color.pendingSoft}`}} />
      {viz.sub ? <div style={{position: 'absolute', left: 96, right: 120, top: 820, color: TOKENS.color.bone, fontFamily: TOKENS.font.mono, fontSize: 30, fontWeight: 700, lineHeight: 1.22, letterSpacing: '.07em', textTransform: 'uppercase', opacity: reveal}}>{viz.sub}</div> : null}
      {viz.dateChip ? (
        <div style={{position: 'absolute', left: 68, right: 68, top: 1090, padding: '37px 22px 43px', borderTop: `3px solid ${TOKENS.color.boneHairline}`, borderBottom: `3px solid ${TOKENS.color.boneHairline}`, opacity: chipReveal, transform: `translateY(${interpolate(chipReveal, [0, 1], [50, 0])}px) scale(${Math.min(1, 10 / Math.max(10, viz.dateChip.length))})`}}>
          <FlipClock label={viz.dateChip.toUpperCase()} compact frameOverride={Math.max(0, frame - chipStart)} />
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 96, right: 96, top: 1325, display: 'flex', justifyContent: 'space-between', color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 18, letterSpacing: '.14em'}}><span>FULL-BLEED / TITLE</span><span>DATA EXPLAINER</span></div>
    </SceneField>
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
  const draw = relativeProgress(frame, duration, .08, .7);
  const hasViz = Boolean(line.viz);

  if (line.viz?.kind === 'title') {
    return <TitleMoment viz={line.viz} frame={frame} duration={duration} lineIndex={lineIndex} speaker={line.speaker} />;
  }

  return (
    <SceneField>
      <div style={{position: 'absolute', top: 112, left: 96, right: 96, height: 48, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 16}}>
        <div style={{width: 42, height: 8, background: TOKENS.color.pending}} />
        <div style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: jessica ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontFamily: TOKENS.font.mono, fontSize: 21, fontWeight: 800}}>{jessica ? 'J' : 'G'}</div>
        <div style={{fontFamily: TOKENS.font.mono, color: jessica ? TOKENS.color.pending : TOKENS.color.bone, fontSize: 22, fontWeight: 700, letterSpacing: '.17em'}}>{String(lineIndex + 1).padStart(2, '0')} / {line.speaker.toUpperCase()}</div>
        <div style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
      </div>
      <div style={{position: 'absolute', top: 270, left: 96, right: 96, height: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(enter, [0, 1], [90, 0])}px)`, opacity: enter}}>
        {hasViz ? (
          <div style={{width: '100%'}}><StructuredVisual viz={line.viz!} progress={draw} /></div>
        ) : (
          <KineticStatement text={line.text} progress={enter} />
        )}
      </div>
    </SceneField>
  );
};
