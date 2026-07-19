import {interpolate, useCurrentFrame} from 'remotion';
import {TOKENS} from '../tokens';
import {snapProgress} from './motion';

export type BarDatum = {label: string; value: number; miss?: boolean};

export const BarRow = ({datum, index, recolorFrame = 26}: {datum: BarDatum; index: number; recolorFrame?: number}) => {
  const frame = useCurrentFrame();
  const progress = snapProgress(frame, index * 3, 24);
  const recolor = datum.miss && frame >= recolorFrame + index * 3;
  return (
    <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', width: 78, height: 440, gap: 16}}>
      <div style={{fontFamily: TOKENS.font.mono, fontSize: 22, color: TOKENS.color.bone, fontWeight: 600}}>{Math.round(datum.value * progress)}</div>
      <div
        style={{
          width: 58,
          height: datum.value * 3.5 * progress,
          minHeight: 8,
          background: recolor ? TOKENS.color.miss : TOKENS.color.bone,
          transformOrigin: 'bottom',
          boxShadow: recolor ? `inset 0 -8px 0 rgba(13,15,20,.18)` : undefined,
        }}
      />
      <div style={{fontFamily: TOKENS.font.mono, fontSize: 20, color: TOKENS.color.boneMuted, fontWeight: 500}}>{datum.label}</div>
    </div>
  );
};

export const BarChart = ({data, recolorFrame = 26}: {data: BarDatum[]; recolorFrame?: number}) => {
  const frame = useCurrentFrame();
  const ruleWidth = interpolate(frame, [0, 24], [0, 100], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'relative', width: 888, height: 510}}>
      <div style={{position: 'absolute', left: 0, bottom: 53, width: `${ruleWidth}%`, height: 3, background: TOKENS.color.boneHairline}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between'}}>
        {data.map((datum, index) => <BarRow key={datum.label} datum={datum} index={index} recolorFrame={recolorFrame} />)}
      </div>
    </div>
  );
};
