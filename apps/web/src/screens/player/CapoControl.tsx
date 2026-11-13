import { Gauge } from 'lucide-react';
import { findTuning, getTuning, MAX_CAPO, tuningNotes } from '../../music/tunings';
import { Button, Popover, Slider } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { useSettings } from '../../ui/settings';
import { TuningSelect } from '../TuningSelect';

interface Props {
  capo: number;
  onCapo: (c: number) => void;
  /** Tuning override id ('' = the tab's own). */
  tuningId: string;
  onTuning: (id: string) => void;
  /** The tuning the tab file was written for (tab order, highest string first). */
  tabTuning: number[];
}

/** Stage-corner button + popover: capo fret and tuning for this tab. */
export function CapoControl({ capo, onCapo, tuningId, onTuning, tabTuning }: Props) {
  const [, setSettings] = useSettings();
  const own = findTuning(tabTuning);
  const effective = tuningId ? getTuning(tuningId) : own;
  const label = capo ? `Kapo ${capo}` : 'Kapo yok';
  return (
    <Popover
      label="Kapo ve akort"
      side="bottom"
      align="end"
      trigger={
        <button type="button" className={`stage-capo${capo ? ' is-on' : ''}`} aria-label={`Kapo ve akort: ${label}, ${effective?.label ?? 'tab akordu'}`}>
          <span className="num">{label}</span>
          {effective && effective.id !== 'standard' && <span className="stage-capo-tuning">{effective.label}</span>}
        </button>
      }
    >
      <div className="capo-pop">
        <Slider label="Kapo" min={0} max={MAX_CAPO} step={1} value={capo} onChange={onCapo} format={(v) => (v ? `${v}. perde` : 'Yok')} />
        <p className="subtle small">Tab kapoya göre okunur: 0 kapo perdesidir. Ses ve 3D işaretler kayar.</p>
        <TuningSelect
          allowTab
          value={tuningId}
          onChange={(id) => {
            onTuning(id);
            if (id) setSettings({ tuningId: id });
          }}
        />
        <p className="subtle small">Tab'ın akordu: {own ? `${own.label} · ` : ''}{tuningNotes({ id: '', label: '', midi: tabTuning })}</p>
        <Button
          size="sm"
          icon={<Gauge size={15} />}
          onClick={() => {
            if (effective) setSettings({ tuningId: effective.id });
            navigate({ name: 'tuner' });
          }}
        >
          Akort aletini aç
        </Button>
      </div>
    </Popover>
  );
}
