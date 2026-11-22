import React, { useEffect, useId, useRef, useState } from 'react';
import { createStudio } from '../studio.js';
import './studio.css';

const callLabels = { idle: 'Вне конференции', connecting: 'Подключение…', active: 'В конференции' };
const locations = { browser: 'Локальный клиент · браузер', server: 'Локальный сервер · отдельный процесс' };

function Monitor({ stream, local = false }) {
  const video = useRef(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [videoVisible, setVideoVisible] = useState(false);
  useEffect(() => {
    const el = video.current;
    let current = true;
    const refresh = () => setVideoVisible(Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled)));
    refresh();
    stream?.addEventListener('addtrack', refresh);
    stream?.addEventListener('removetrack', refresh);
    el.srcObject = stream;
    setNeedsPlay(false);
    if (stream) el.play().catch(() => { if (current) setNeedsPlay(true); });
    return () => {
      current = false;
      stream?.removeEventListener('addtrack', refresh);
      stream?.removeEventListener('removetrack', refresh);
      el.srcObject = null;
    };
  }, [stream]);
  const title = local ? 'Исходящее видео' : 'Входящее видео';
  return <figure className={'monitor ' + (local ? 'outgoing' : 'incoming')}>
    <figcaption>{title}</figcaption>
    <video ref={video} autoPlay playsInline muted={local} aria-label={title} />
    {!videoVisible && <div className="empty-feed"><span className="reticle" aria-hidden="true"/><span>{local ? 'Нет изображения' : 'Ожидание видеопотока'}</span></div>}
    {needsPlay && <button className="play" onClick={() => video.current.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true))}>Воспроизвести</button>}
  </figure>;
}

function Device({ kind, state, run, busy, studio }) {
  const camera = kind === 'camera';
  const name = camera ? 'Камера' : 'Микрофон';
  const devices = state.devices.filter(d => d.kind === (camera ? 'videoinput' : 'audioinput') && d.deviceId);
  const active = state[kind];
  return <div className="device">
    <button aria-pressed={active} aria-label={name} disabled={busy} onClick={() => run(kind, () => camera ? studio.toggleCamera() : studio.toggleMic())}>
      <span className={'lamp ' + (active ? 'on' : '')}/>{name}<span className="device-state">{active ? 'вкл' : 'выкл'}</span>
    </button>
    <select aria-label={'Устройство · ' + name} value={state[kind + 'Id'] || ''} disabled={busy || !devices.length}
      onChange={e => run(kind, () => studio.setDevice(kind, e.target.value))}>
      <option value="" disabled>По умолчанию</option>
      {devices.map((d, index) => <option key={d.deviceId} value={d.deviceId}>{d.label || name + ' ' + (index + 1)}</option>)}
    </select>
  </div>;
}

function Processor({ kind, model, run, busy, studio }) {
  const [open, setOpen] = useState(false);
  const group = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const selected = model.options.find(o => o.id === model.selected);
  const title = kind === 'maker' ? 'Генератор' : 'Детектор';
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!group.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <section className="processor" aria-labelledby={id + '-title'}>
    <header><h3 id={id + '-title'}>{title}</h3>
      <button type="button" className="switch" role="switch" aria-checked={model.active} aria-label={title}
        disabled={busy || (!model.active && !selected?.available)} onClick={() => { setOpen(false); run(kind, () => studio.toggle(kind)); }}>
        <span aria-hidden="true"/>
      </button>
    </header>
    <div className="sub">{kind === 'maker' ? 'Исходящий поток' : 'Входящий поток'}</div>
    <div className="choice" ref={group} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); trigger.current.focus(); } }}>
      <button ref={trigger} className="picker" aria-label={'Реализация · ' + title + ' · ' + (selected?.label || 'Выбрать')}
        aria-expanded={open} aria-controls={id} disabled={model.active || busy} onClick={() => setOpen(!open)}>
        <span>{selected?.label || 'Выберите реализацию'}</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <fieldset id={id} className="options"><legend className="sr">Реализация · {title}</legend>
        {model.options.map(option => <label key={option.id} className="option">
          <input type="radio" name={id} checked={option.id === model.selected} disabled={!option.available}
            onChange={() => { trigger.current.focus(); setOpen(false); run(kind, () => studio.select(kind, option.id)); }}/>
          <span><strong>{option.label}</strong><small>{locations[option.location]}</small>{!option.available && <small>{option.reason || 'Недоступно на этом устройстве'}</small>}</span>
        </label>)}
        {!model.options.length && <p>Доступных реализаций пока нет</p>}
      </fieldset>}
    </div>
    {selected && <div className="detail">{locations[selected.location]}{!selected.available && selected.reason && <div>{selected.reason}</div>}</div>}
  </section>;
}

export default function App() {
  const service = useRef(null);
  const [state, setState] = useState(null);
  const [server, setServer] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState({});
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const studio = createStudio(setState);
    service.current = studio;
    setState(studio.snapshot());
    return () => { service.current = null; studio.dispose(); };
  }, []);
  async function run(key, action) {
    setBusy(old => ({ ...old, [key]: true }));
    setNotice('');
    try { await action(); }
    catch (error) { setNotice(error?.message || String(error)); }
    finally { setBusy(old => ({ ...old, [key]: false })); }
  }
  if (!state) return <main>Загрузка студии…</main>;
  const studio = service.current;
  const inCall = state.call !== 'idle';
  const result = typeof state.result === 'string' ? state.result : state.result?.text;
  return <main>
    <header className="mast"><h1><span className="mark" aria-hidden="true"><i/><i/><i/></span>Deepfake Demo</h1>
      <span role="status" className="call-state"><span className={'lamp ' + (state.call === 'active' ? 'on' : '')}/>{callLabels[state.call]}</span>
    </header>
    <form className="connection" onSubmit={e => { e.preventDefault(); run('dial', () => studio.dial(server.trim(), number.trim())); }}>
      <label>Адрес SIP-сервера<input required value={server} placeholder="sip.example.org" disabled={inCall || busy.dial} onChange={e => setServer(e.target.value)} spellCheck={false} autoCapitalize="none"/></label>
      <label>Номер конференции<input required value={number} placeholder="1000" disabled={inCall || busy.dial} onChange={e => setNumber(e.target.value)} /></label>
      {inCall ? <button type="button" className="end" disabled={busy.hangup} onClick={() => run('hangup', () => studio.hangup())}>Завершить звонок</button> :
        <button className="connect" disabled={busy.dial || !server.trim() || !number.trim()} type="submit">Начать звонок</button>}
    </form>
    {(notice || state.error) && <div role="alert" className="error">{notice || state.error?.message || String(state.error)}</div>}
    <div className="workspace"><section className="video-section"><h2>Видеомонитор</h2>
      <div className="feeds"><Monitor stream={state.remote}/><Monitor local stream={state.camera ? state.local : null}/></div>
      <div className="media">{['camera','mic'].map(kind => <Device key={kind} {...{kind,state,run,studio}} busy={busy[kind]}/>)}</div>
    </section>
    <aside><h2>Обработка видео</h2>
      {['maker','detector'].map(kind => <Processor key={kind} {...{kind,studio,run}} model={state[kind]} busy={busy[kind]}/>)}
      {state.detector.active && <p className="result" role="status">{result || 'Ожидание результата анализа'}</p>}
    </aside></div>
  </main>;
}
