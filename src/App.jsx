import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Aperture, ArrowDownToLine, ArrowRight, BookOpen, Camera, Check, ChevronRight, CircleHelp, Focus, Maximize2, MousePointer2, MoveHorizontal, Mountain, Play, RotateCcw, ScanLine, SlidersHorizontal, Sparkles, Sprout, Square, X } from 'lucide-react';
import { createLaboratory } from './laboratory.js';
import { createPhotoRenderer } from './photograph.js';
import { DEFAULT_SETTINGS, SUBJECTS, calculateOptics, clampSettings, formatDistance } from './optics.js';

const INITIAL_OPTIONS = { exploded: true, rays: false, focusPlane: true, labels: true };
const EXPERIMENTS = [
  { title: 'Find your focus', subtitle: 'One scene. Three points of view.', icon: Focus, duration: 9000 },
  { title: 'A little more depth', subtitle: 'Discover what the aperture reveals.', icon: Aperture, duration: 7000 },
  { title: 'Change your perspective', subtitle: 'Explore the reach of your lens.', icon: MoveHorizontal, duration: 7000 },
];

function Parameter({ number, name, property, value, unit, min, max, step, ticks, description, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(String(Number(value.toFixed(1)))); }, [value]);
  const commit = () => {
    editing.current = false;
    const parsed = draft.trim() === '' ? value : Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    onChange(property, Math.round(next / step) * step);
    setDraft(String(Number(next.toFixed(1))));
  };
  return <div className="parameter">
    <div className="parameter-heading"><span className="parameter-index">{number}</span><label htmlFor={`${property}-range`}>{name}</label></div>
    <div className="parameter-value">
      {property === 'aperture' && <span className="value-prefix">f/</span>}
      <input aria-label={`${name} value`} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} style={{ width: `${Math.max(1.3, draft.length * .61)}em` }}
        onFocus={e => { editing.current = true; e.target.select(); }} onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
      {unit && <span className="parameter-unit">{unit}</span>}
      <span className="editable-hint">EDIT</span>
    </div>
    <input id={`${property}-range`} className="range-input" type="range" min={min} max={max} step={step} value={value}
      style={{ '--range-progress': `${100 * (value - min) / (max - min)}%` }} onChange={e => onChange(property, Number(e.target.value))} />
    <div className="range-ticks">{ticks.map(t => <span key={t} style={{ left: `${100 * (parseFloat(t.replace(/[^\d.]/g, '')) - min) / (max - min)}%` }}>{t}</span>)}</div>
    <p className="parameter-description">{description}</p>
  </div>;
}

function SceneToggle({ label, enabled, onClick }) {
  return <button className={`scene-toggle ${enabled ? 'enabled' : ''}`} aria-pressed={enabled} onClick={onClick}>
    <span className="toggle-track"><span /></span>{label}
  </button>;
}

export default function App() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [options, setOptions] = useState({ ...INITIAL_OPTIONS });
  const [selection, setSelection] = useState('cabin');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [captures, setCaptures] = useState([null, null]);
  const [mode, setMode] = useState('live');
  const [split, setSplit] = useState(50);
  const [experiment, setExperiment] = useState(null);
  const [experimentMessage, setExperimentMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [detailView, setDetailView] = useState(false);
  const [photoFocused, setPhotoFocused] = useState(false);
  const sceneCanvas = useRef(null);
  const photoCanvas = useRef(null);
  const exhibit = useRef(null);
  const dialog = useRef(null);
  const lab = useRef(null);
  const photo = useRef(null);
  const stateRef = useRef(settings);
  const captureRef = useRef(captures);
  const animationRef = useRef(0);
  const sequenceRef = useRef(0);
  const timersRef = useRef([]);
  const toastTimer = useRef(0);
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  stateRef.current = settings;
  captureRef.current = captures;
  const optics = calculateOptics(settings);

  const notify = useCallback(message => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const stopExperiment = useCallback(() => {
    sequenceRef.current++;
    cancelAnimationFrame(animationRef.current);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setExperiment(null);
    setProgress(0);
  }, []);

  useEffect(() => {
    try {
      photo.current = createPhotoRenderer(photoCanvas.current, DEFAULT_SETTINGS);
      lab.current = createLaboratory(sceneCanvas.current, {
        settings: DEFAULT_SETTINGS,
        onFocus: (distance, subjectId) => {
          stopExperiment();
          setSettings(current => clampSettings({ ...current, focusDistance: distance }));
          setSelection(subjectId || null);
        },
      });
      photo.current.render();
      lab.current.update(DEFAULT_SETTINGS, INITIAL_OPTIONS);
      setReady(true);
      window.__OPTICA__ = {
        getDiagnostics: () => ({ settings: { ...stateRef.current }, optics: calculateOptics(stateRef.current),
          laboratory: lab.current?.getDiagnostics(), photograph: photo.current?.getDiagnostics(), captures: captureRef.current.map(c => c?.settings || null) }),
      };
    } catch (e) {
      console.error('OPTICA initialization failed', e);
      setError('The 3D laboratory needs WebGL. Enable hardware acceleration in your browser and reload to enter the exhibit.');
    }
    return () => {
      stopExperiment();
      clearTimeout(toastTimer.current);
      lab.current?.dispose();
      photo.current?.dispose();
      delete window.__OPTICA__;
    };
  }, [stopExperiment]);

  useEffect(() => {
    if (!ready) return;
    lab.current.update(settings, options);
    photo.current.update(settings);
    photo.current.render();
  }, [settings, options, ready]);

  const changeParameter = (property, value) => {
    stopExperiment();
    setSettings(current => clampSettings({ ...current, [property]: value }));
    if (property === 'focusDistance') setSelection(SUBJECTS.find(s => Math.abs(s.distance - value) < .05)?.id || null);
  };

  const tween = (target, token) => {
    cancelAnimationFrame(animationRef.current);
    const from = { ...stateRef.current };
    const to = clampSettings({ ...from, ...target });
    const start = performance.now();
    let last = 0;
    const frame = now => {
      if (token !== sequenceRef.current) return;
      const t = reducedMotion.current ? 1 : Math.min(1, (now - start) / 650);
      const ease = t * t * (3 - 2 * t);
      if (now - last > 45 || t === 1) {
        const next = Object.fromEntries(Object.keys(to).map(k => [k, from[k] + (to[k] - from[k]) * ease]));
        setSettings(next);
        last = now;
      }
      if (t < 1) animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
  };

  const runExperiment = index => {
    stopExperiment();
    setMode('live');
    setExperiment(index);
    const token = sequenceRef.current;
    const duration = EXPERIMENTS[index].duration;
    const begin = performance.now();
    const timeline = index === 0 ? [
      { delay: 0, target: { focusDistance: 3, aperture: 1.4, focalLength: 50 }, selection: 'flower', message: 'The foreground flowers come into focus as the cabin melts into soft light.' },
      { delay: 3000, target: { focusDistance: 8 }, selection: 'cabin', message: 'Focus travels to the cabin; the flowers now become a soft foreground.' },
      { delay: 6000, target: { focusDistance: 24 }, selection: 'mountains', message: 'The distant mountain ridge becomes sharp while the foreground falls away.' },
    ] : index === 1 ? [
      { delay: 0, target: { aperture: 1.4 }, message: 'At f/1.4, a wide opening isolates your subject and turns lights into larger bokeh.' },
      { delay: 3500, target: { aperture: 16 }, message: 'At f/16, a smaller opening brings more of the same scene into acceptable focus.' },
    ] : [
      { delay: 0, target: { focalLength: 24 }, message: 'At 24 mm, the wider field of view includes more of the landscape.' },
      { delay: 3500, target: { focalLength: 85 }, message: 'At 85 mm, a narrower view magnifies the scene from the same camera position.' },
    ];
    timeline.forEach(step => timersRef.current.push(setTimeout(() => {
      if (token !== sequenceRef.current) return;
      setExperimentMessage(step.message);
      if (step.selection) setSelection(step.selection);
      tween(step.target, token);
    }, step.delay)));
    const updateProgress = () => {
      if (token !== sequenceRef.current) return;
      const next = Math.min(1, (performance.now() - begin) / duration);
      setProgress(next);
      if (next < 1) timersRef.current.push(setTimeout(updateProgress, 100));
      else { setExperiment(null); setProgress(0); }
    };
    updateProgress();
  };

  const capture = index => {
    if (!photo.current) return;
    const image = photo.current.capture();
    setCaptures(current => current.map((entry, i) => i === index ? { image, settings: { ...stateRef.current } } : entry));
    notify(`Photograph ${index === 0 ? 'A' : 'B'} saved. ${captureRef.current[1 - index] ? 'Your comparison is ready.' : 'Change a setting and take your second shot.'}`);
  };

  const exportPhoto = async () => {
    if (!photo.current) return;
    let image;
    if (mode === 'compare' && captures.every(Boolean)) {
      const images = await Promise.all(captures.map(c => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = c.image;
      })));
      const canvas = document.createElement('canvas');
      canvas.width = images[0].width; canvas.height = images[0].height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(images[1], 0, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, canvas.width * split / 100, canvas.height); ctx.clip();
      ctx.drawImage(images[0], 0, 0); ctx.restore();
      image = canvas.toDataURL('image/png');
    } else image = photo.current.capture();
    const link = document.createElement('a');
    link.download = `optica-${mode === 'compare' ? 'comparison' : `${Math.round(settings.focalLength)}mm-f${settings.aperture.toFixed(1)}`}.png`;
    link.href = image; link.click();
    notify('Your photograph has been exported as a PNG.');
  };

  const reset = () => {
    stopExperiment();
    setSettings({ ...DEFAULT_SETTINGS }); setOptions({ ...INITIAL_OPTIONS }); setSelection('cabin');
    setDetailView(false); setMode('live'); setSplit(50); setExperimentMessage('');
    lab.current?.resetView();
    notify('The optical bench is back to its starting position. Your captures are kept.');
  };

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await exhibit.current.requestFullscreen();
    } catch { notify('Fullscreen is unavailable in this browser.'); }
  };

  return <div className="app-shell">
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="OPTICA home"><span className="brand-mark"><Aperture size={27} strokeWidth={1.35} /></span>OPTICA<span className="brand-dot">®</span></a>
      <span className="header-divider" />
      <span className="header-descriptor">A LABORATORY FOR THE CURIOUS</span>
      <div className="header-right"><span className="edition">LIGHT, MADE VISIBLE <span>—</span> VOL. 01</span>
        <button className="help-button" onClick={() => dialog.current.showModal()}><BookOpen size={15} /> Field guide <ChevronRight size={13} /></button></div>
    </header>

    <main>
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> THE OPTICAL BENCH <span className="eyebrow-number">/ 001</span></div>
        <h1>See light differently<span>.</span></h1><p>A hands-on exploration of focus, depth, and the art of looking.</p></div>
        <div className="simulation-status"><span className={ready ? 'status-dot' : 'status-dot loading'} />{ready ? 'LIVE SIMULATION' : 'PREPARING THE EXHIBIT'}</div>
      </div>

      {error && <div className="error-message" role="alert"><CircleHelp size={18} />{error}</div>}

      <div className="workspace">
        <section className="exhibit-and-controls" aria-label="Interactive optical laboratory">
          <div className="exhibit" ref={exhibit}>
            <div className="exhibit-topline"><span><span className="tiny-cross">+</span> INSPECTION VIEW</span><span className="view-tag">{detailView ? 'LENS DETAIL' : 'OPTICAL ASSEMBLY'}</span></div>
            <canvas className="laboratory-canvas" ref={sceneCanvas} aria-label="Interactive 3D optical bench. Drag to orbit, click a landscape subject to focus, or drag the cyan focus plane." />
            {!ready && !error && <div className="scene-loading"><Aperture size={28} /><span>Bringing light into focus…</span></div>}
            <div className="scene-legend"><span><i className="legend-line sensor" />SENSOR</span><span><i className="legend-line lens" />EFFECTIVE LENS</span><span><i className="legend-line focus" />FOCUS PLANE</span></div>
            <div className="scene-bottomline"><span className="orbit-hint"><MousePointer2 size={13} /> Drag to orbit <span>·</span> Scroll to explore</span>
              <div className="scene-view-buttons"><button className={detailView ? 'active' : ''} onClick={() => { const next = !detailView; setDetailView(next); lab.current?.setPreset(next ? 'lens' : 'overview'); }} aria-label={detailView ? 'Return to overview' : 'Inspect lens detail'} title="Inspect lens detail"><Focus size={16} /></button>
              <button onClick={() => { setDetailView(false); lab.current?.resetView(); }} aria-label="Reset inspection view" title="Reset inspection view"><RotateCcw size={15} /></button>
              <button onClick={fullscreen} aria-label="Fullscreen laboratory" title="Fullscreen"><Maximize2 size={15} /></button></div></div>
          </div>
          <div className="scene-options"><div className="scene-switches">
            <SceneToggle label="Exploded lens" enabled={options.exploded} onClick={() => setOptions(current => ({ ...current, exploded: !current.exploded }))} />
            <SceneToggle label="Light paths" enabled={options.rays} onClick={() => setOptions(current => ({ ...current, rays: !current.rays }))} />
            <SceneToggle label="Focus plane" enabled={options.focusPlane} onClick={() => setOptions(current => ({ ...current, focusPlane: !current.focusPlane }))} />
          </div><button className="text-button reset-button" onClick={reset}><RotateCcw size={13} />Reset all</button></div>

          <div className="control-panel"><div className="control-topline"><span><SlidersHorizontal size={13} /> THE VARIABLES</span><span>Small adjustments. Entirely new worlds.</span></div>
            <div className="parameters">
              <Parameter number="01" name="Focus distance" property="focusDistance" value={settings.focusDistance} unit="m" min={1} max={30} step={.1} ticks={['1 m', '10', '20', '30 m']} description="Choose where the world becomes sharp." onChange={changeParameter} />
              <Parameter number="02" name="Aperture" property="aperture" value={settings.aperture} min={1.4} max={16} step={.1} ticks={['f/1.4', 'f/5.6', 'f/11', 'f/16']} description="Shape the light. Control the depth." onChange={changeParameter} />
              <Parameter number="03" name="Focal length" property="focalLength" value={settings.focalLength} unit="mm" min={24} max={85} step={1} ticks={['24 mm', '35', '50', '85 mm']} description="Decide how much of the story to tell." onChange={changeParameter} />
            </div>
          </div>
        </section>

        <aside className={`photograph-panel ${photoFocused ? 'photo-expanded' : ''}`} aria-label="Live photograph and captures">
          <div className="panel-eyebrow"><Camera size={14} /> THROUGH THE LENS <span className="live-label"><span />LIVE</span></div>
          <div className="photo-title-row"><h2>Your point of view.</h2><button className="icon-button" aria-label="Enlarge photograph" title="Enlarge photograph" onClick={() => setPhotoFocused(!photoFocused)}><Maximize2 size={15} /></button></div>
          <p className="photo-description">Same scene. A different way of seeing.</p>
          <div className="photo-mode-tabs"><button className={mode === 'live' ? 'selected' : ''} onClick={() => setMode('live')}>Live photograph</button>
            <button className={mode === 'compare' ? 'selected' : ''} onClick={() => { if (captures.every(Boolean)) setMode('compare'); else notify('Capture A and B to unlock the comparison.'); }} aria-disabled={!captures.every(Boolean)}>A/B comparison <span className="comparison-count">{captures.filter(Boolean).length}/2</span></button></div>
          <div className="photo-frame">
            <canvas ref={photoCanvas} className="photograph-canvas" aria-label="Live photograph rendered through the independent photographic camera" />
            {mode === 'compare' && captures.every(Boolean) && <div className="compare-view">
              <img src={captures[1].image} alt="Captured photograph B" />
              <img src={captures[0].image} alt="Captured photograph A" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
              <span className="capture-label label-a">A</span><span className="capture-label label-b">B</span>
              <div className="compare-divider" style={{ left: `${split}%` }}><span><MoveHorizontal size={17} /></span></div>
              <input className="comparison-slider" type="range" aria-label="A/B comparison position" min="0" max="100" value={split} onChange={e => setSplit(Number(e.target.value))} />
            </div>}
            <div className="viewfinder-corner top-left" /><div className="viewfinder-corner top-right" /><div className="viewfinder-corner bottom-left" /><div className="viewfinder-corner bottom-right" />
            <div className="photo-exif"><span>{Math.round(settings.focalLength)} MM</span><span>f/{settings.aperture.toFixed(1)}</span><span>{settings.focusDistance.toFixed(1)} M</span></div>
          </div>
          <div className="focus-subjects"><span>FOCUS ON</span>{SUBJECTS.map((subject, index) => {
            const Icon = [Sprout, Square, Mountain][index];
            return <button key={subject.id} className={selection === subject.id ? 'selected' : ''} onClick={() => { changeParameter('focusDistance', subject.distance); setSelection(subject.id); }}><Icon size={12} />{subject.label}</button>;
          })}</div>
          <div className="depth-card"><div className="depth-heading"><span><ScanLine size={13} /> DEPTH OF FIELD</span><span>ACCEPTABLE FOCUS</span></div>
            <div className="depth-values"><div><small>NEAR LIMIT</small><strong>{formatDistance(optics.nearLimit)}</strong></div><div className="depth-connector"><span /><MoveHorizontal size={14} /><span /></div><div><small>FAR LIMIT</small><strong>{formatDistance(optics.farLimit)}</strong></div></div>
            <div className="depth-visual"><span className="dof-range" style={{ left: `${100 * Math.min(30, optics.nearLimit) / 30}%`, width: `${100 * (Math.min(30, optics.farLimit) - Math.min(30, optics.nearLimit)) / 30}%` }} /><span className="dof-focus" style={{ left: `${100 * settings.focusDistance / 30}%` }} /></div>
            <p>36 × 24 mm sensor <span>·</span> 0.03 mm circle of confusion</p>
          </div>
          <div className="capture-heading"><span>KEEP A MOMENT</span><span>TWO SHOTS. ONE DISCOVERY.</span></div>
          <div className="capture-buttons">{['A', 'B'].map((label, index) => <button key={label} className={`capture-button ${captures[index] ? 'captured' : ''}`} onClick={() => capture(index)} disabled={!ready}>
            <span className="capture-letter">{label}</span><div><strong>{captures[index] ? `Retake shot ${label}` : `Capture ${label}`}</strong><small>{captures[index] ? `${captures[index].settings.focusDistance.toFixed(1)} m · f/${captures[index].settings.aperture.toFixed(1)} · ${Math.round(captures[index].settings.focalLength)} mm` : 'Save this photograph'}</small></div>{captures[index] ? <Check size={14} /> : <Camera size={15} />}
          </button>)}</div>
          <button className="export-button" onClick={exportPhoto} disabled={!ready}><ArrowDownToLine size={15} />Export {mode === 'compare' ? 'comparison' : 'photograph'}<span>PNG</span></button>
          <div className="model-note"><span className="note-dot" /><p>A simplified thin-lens model.<br />A little science. A lot to see.</p><button className="icon-button" aria-label="About the optical model" onClick={() => dialog.current.showModal()}><CircleHelp size={15} /></button></div>
        </aside>
      </div>

      <section className="experiments-section" aria-label="Guided experiments">
        <div className="experiments-heading"><div><span className="eyebrow">FOLLOW YOUR CURIOSITY</span><h2>A few things to try.</h2></div><span className="experiment-caption">Three small experiments. A new way to look.</span></div>
        <div className="experiment-cards">{EXPERIMENTS.map((item, index) => {
          const Icon = item.icon;
          const active = experiment === index;
          return <button className={`experiment-card ${active ? 'active' : ''}`} key={item.title} onClick={() => active ? stopExperiment() : runExperiment(index)}>
            <span className="experiment-icon"><Icon size={21} strokeWidth={1.35} /></span><div><span className="experiment-number">EXPERIMENT 0{index + 1}</span><h3>{item.title}</h3><p>{item.subtitle}</p></div><span className="experiment-play">{active ? <Square size={12} fill="currentColor" /> : <ArrowRight size={18} />}</span>
            {active && <span className="experiment-progress" style={{ width: `${progress * 100}%` }} />}
          </button>;
        })}</div>
        {experimentMessage && <div className="experiment-explanation" aria-live="polite"><Sparkles size={14} /><p>{experimentMessage}</p>{experiment !== null && <button onClick={stopExperiment} aria-label="Stop experiment"><X size={14} /></button>}</div>}
      </section>
    </main>

    <footer><span className="footer-brand">OPTICA <span>—</span> THE BEAUTY IS IN THE DETAILS.</span><span>Built for exploration. Designed for wonder.<span className="footer-star">✳</span></span></footer>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite"><Check size={15} />{toast}</div>
    <dialog ref={dialog} className="field-guide" onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}>
      <button className="dialog-close" aria-label="Close field guide" onClick={() => dialog.current.close()}><X size={20} /></button>
      <span className="eyebrow">THE OPTICA FIELD GUIDE</span><h2>A little science,<br />a different way to see.</h2>
      <p>Orbit the bench to inspect the mechanism. Click a flower, the cabin, or a mountain to focus; drag the cyan plane for finer control. The photograph always looks through its own fixed camera.</p>
      <div className="guide-item"><Focus size={21} /><div><h3>Focus makes a choice.</h3><p>Only one distance is perfectly sharp. The depth-of-field limits mark where blur stays below our 0.03 mm criterion.</p></div></div>
      <div className="guide-item"><Aperture size={21} /><div><h3>The opening changes the story.</h3><p>Aperture diameter is focal length ÷ f-number. A wider opening creates larger blur circles outside your chosen focus distance.</p></div></div>
      <div className="guide-item"><MoveHorizontal size={21} /><div><h3>A lens changes your reach.</h3><p>A longer focal length narrows the field of view from the same camera position. Exposure stays compensated so you can compare optical effects.</p></div></div>
      <div className="model-equation"><span>THE THIN-LENS EQUATION</span><strong>1 / f = 1 / s + 1 / v</strong><p>f: focal length · s: focus distance · v: sensor image distance<br />Full-frame 36 × 24 mm sensor. All calculations use meters.</p></div>
      <p className="guide-footnote">An educational model: depth-aware blur and ray geometry share the same parameters. Aberrations, diffraction, and exposure changes are omitted. Diagram distances are compressed for clarity; the brass plane is the fixed effective lens.</p>
      <button className="guide-done" onClick={() => dialog.current.close()}>Back to the bench <ArrowRight size={16} /></button>
    </dialog>
  </div>;
}
