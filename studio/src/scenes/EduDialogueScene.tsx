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

const KineticHeadline = ({text, progress, right}: {text: string; progress: number; right: boolean}) => (
  <div style={{position: 'relative', minHeight: 430, boxSizing: 'border-box', padding: '58px 58px 72px', border: `4px solid ${TOKENS.color.pending}`, borderRadius: TOKENS.radius.card, background: TOKENS.color.bone, color: TOKENS.color.ink, boxShadow: `${right ? -18 : 18}px 18px 0 ${TOKENS.color.pendingSoft}`, overflow: 'hidden'}}>
    <div style={{position: 'absolute', top: 25, right: 28, fontFamily: TOKENS.font.mono, fontSize: 17, fontWeight: 700, letterSpacing: '.16em'}}>KINETIC / HEADLINE</div>
    <div style={{marginTop: 62, fontFamily: TOKENS.font.display, fontSize: text.length > 70 ? 54 : text.length > 44 ? 63 : 73, lineHeight: .9, letterSpacing: '-.05em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left', transform: `translateX(${interpolate(progress, [0, 1], [right ? 90 : -90, 0])}px)`, opacity: progress}}>{text}</div>
    <div style={{position: 'absolute', left: right ? `${100 - progress * 100}%` : 0, right: right ? 0 : `${100 - progress * 100}%`, bottom: 0, height: 15, background: TOKENS.color.pending}} />
  </div>
);

const StatBig = ({value, label, sub, progress}: Extract<Viz, {kind: 'statBig'}> & {progress: number}) => (
  <div style={{height: 455, boxSizing: 'border-box', position: 'relative', padding: '43px 48px', borderRadius: TOKENS.radius.card, border: `3px solid ${TOKENS.color.pending}`, background: `linear-gradient(135deg, ${TOKENS.color.pendingSoft}, rgba(13,15,20,.84) 64%)`, overflow: 'hidden', boxShadow: `0 0 36px ${TOKENS.color.pendingSoft}`}}>
    <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.boneMuted, fontSize: 20, fontWeight: 700, letterSpacing: '.17em'}}>SINGLE / STAT</div>
    <div style={{marginTop: 58, color: TOKENS.color.pending, fontFamily: TOKENS.font.display, fontSize: value.length > 10 ? 100 : 142, lineHeight: .78, letterSpacing: '-.07em', whiteSpace: 'nowrap', transform: `translateY(${interpolate(progress, [0, 1], [70, 0])}px) scale(${.8 + progress * .2})`, transformOrigin: 'left center', opacity: progress, textShadow: `0 0 34px ${TOKENS.color.pendingSoft}`}}>{value}</div>
    <div style={{position: 'absolute', left: 48, right: 48, bottom: sub ? 75 : 43, paddingTop: 21, borderTop: `4px solid ${TOKENS.color.bone}`, fontFamily: TOKENS.font.display, fontSize: 39, lineHeight: .95, letterSpacing: '-.03em', textTransform: 'uppercase'}}>{label}</div>
    {sub ? <div style={{position: 'absolute', left: 48, right: 48, bottom: 31, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 17, letterSpacing: '.07em', textTransform: 'uppercase'}}>{sub}</div> : null}
  </div>
);

const StructuredVisual = ({viz, text, progress, right}: {viz?: Viz; text: string; progress: number; right: boolean}) => {
  if (!viz) return <KineticHeadline text={text} progress={progress} right={right} />;

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
      <div style={{position: 'absolute', top: 98, left: 96, right: 96, display: 'flex', alignItems: 'center', gap: 18, fontFamily: TOKENS.font.mono, color: TOKENS.color.bone, fontSize: 20, fontWeight: 700, letterSpacing: '.17em'}}>
        <span style={{width: 42, height: 8, background: TOKENS.color.pending}} />
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
      <div style={{position: 'absolute', left: 96, right: 96, top: 1450, display: 'flex', justifyContent: 'space-between', color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 18, letterSpacing: '.14em'}}><span>FULL-BLEED / TITLE</span><span>DATA EXPLAINER</span></div>
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
  const bias = jessica ? 'left' : 'right';

  if (line.viz?.kind === 'title') {
    return <TitleMoment viz={line.viz} frame={frame} duration={duration} lineIndex={lineIndex} speaker={line.speaker} />;
  }

  return (
    <SceneField>
      <div style={{position: 'absolute', top: 112, left: 96, right: 96, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 18}}>
        <div style={{width: 42, height: 8, background: TOKENS.color.pending}} />
        <div style={{fontFamily: TOKENS.font.mono, color: TOKENS.color.pending, fontSize: 22, fontWeight: 700, letterSpacing: '.17em'}}>{String(lineIndex + 1).padStart(2, '0')} / {line.speaker.toUpperCase()}</div>
        <div style={{height: 2, flex: 1, background: TOKENS.color.boneHairline}} />
      </div>
      <div style={{position: 'absolute', top: 235, left: jessica ? 96 : 178, right: jessica ? 178 : 96, fontFamily: TOKENS.font.display, fontSize: line.text.length > 58 ? 58 : 69, lineHeight: .92, letterSpacing: '-.048em', textAlign: bias, textTransform: 'uppercase', transform: `translateX(${interpolate(enter, [0, 1], [jessica ? -90 : 90, 0])}px)`, opacity: enter}}>
        {line.text}
      </div>
      <div style={{position: 'absolute', top: 620, left: 96, right: 96, minHeight: 500, display: 'flex', justifyContent: jessica ? 'flex-start' : 'flex-end', alignItems: 'center', transform: `translateY(${interpolate(enter, [0, 1], [100, 0])}px) rotate(${interpolate(enter, [0, 1], [jessica ? -2 : 2, 0])}deg)`, opacity: enter}}>
        <div style={{width: '100%'}}><StructuredVisual viz={line.viz} text={line.text} progress={draw} right={!jessica} /></div>
      </div>
      <div style={{position: 'absolute', left: jessica ? 96 : undefined, right: jessica ? undefined : 96, top: 1395, display: 'flex', flexDirection: jessica ? 'row' : 'row-reverse', alignItems: 'center', gap: 14, color: TOKENS.color.boneMuted, fontFamily: TOKENS.font.mono, fontSize: 19, letterSpacing: '.15em'}}>
        <span style={{display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 7, background: jessica ? TOKENS.color.pending : TOKENS.color.bone, color: TOKENS.color.ink, fontWeight: 800, letterSpacing: 0}}>{jessica ? 'J' : 'G'}</span>
        <span>{bias.toUpperCase()} CHANNEL / ACTIVE</span>
      </div>
    </SceneField>
  );
};
