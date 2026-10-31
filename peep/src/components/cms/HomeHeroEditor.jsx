import HeroVideoPicker from "./HeroVideoPicker";
import { useId, useState } from 'react';
import { ImageUploader } from '../ImageUploader';
import './HomeHeroEditor.css';

export default function HomeHeroEditor({ value, onChange, onSave, saving, bucket, onError, movies = [], shows = [], channels = [], podcasts = [] }) {
  const prefix = useId();
  const [failedURL, setFailedURL] = useState(null);
  const [size, setSize] = useState(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const update = (key, next) => onChange(current => ({ ...current, [key]: next }));
  const list = value.cta_type === 'movie' ? movies : value.cta_type === 'show' ? shows : value.cta_type === 'channel' ? channels : podcasts;
  const selectedContent = ['movie','show','channel','podcast'].includes(value.cta_type)
    ? list.find(item => String(item.id) === String(value.cta_value)) : null;
  const contentArtwork = item => {
    const options = [['hero_image','Hero artwork'],['thumbnail','Background artwork'],['poster','Poster'],['artwork_url','Artwork']];
    const seen = new Set();
    return options.filter(([key]) => item?.[key] && !seen.has(item[key]) && seen.add(item[key]))
      .map(([key,label]) => ({url:item[key],label}));
  };
  const artwork = contentArtwork(selectedContent);
  function chooseContent(id) {
    if (!['movie','show','channel','podcast'].includes(value.cta_type)) { update('cta_value',id); return; }
    const item = list.find(item => String(item.id) === id);
    setFailedURL(null); setSize(null);
    onChange(current => ({...current, cta_value:id, image_url:contentArtwork(item)[0]?.url || ''}));
  }
  const field = (key, title, placeholder, multiline = false) => (
    <label className="hero-editor-field" htmlFor={`${prefix}-${key}`}>
      <span>{title}</span>
      {multiline ? <textarea id={`${prefix}-${key}`} rows={3} value={value[key] || ''} onChange={e => update(key, e.target.value)} placeholder={placeholder} /> :
        <input id={`${prefix}-${key}`} value={value[key] || ''} onChange={e => update(key, e.target.value)} placeholder={placeholder} />}
    </label>
  );
  return (
    <div className="home-hero-editor">
      <div className="hero-editor-columns">
        <section className="hero-editor-artwork" aria-label="Hero artwork">
          <div className="hero-editor-heading"><h3>Artwork</h3><span>16:9 landscape</span></div>
          <div className="hero-editor-preview">
            {value.image_url && failedURL !== value.image_url ? (
              <img key={value.image_url} src={value.image_url} alt="Full hero artwork preview"
                onError={() => { setFailedURL(value.image_url); setSize(null); }}
                onLoad={e => setSize({url:value.image_url,width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} />
            ) : <div className="hero-editor-empty"><strong>{value.image_url ? 'Image unavailable' : 'Your hero artwork goes here'}</strong><span>{value.image_url ? 'Replace the image or check its source URL.' : 'Upload a landscape image to preview it.'}</span></div>}
          </div>
          <div className="hero-editor-caption"><span>Full image · no preview cropping</span>{size?.url === value.image_url && <span>{size.width} × {size.height}</span>}</div>
          {selectedContent && <div className="hero-content-artwork">
            <strong>Artwork from {selectedContent.title || selectedContent.name}</strong>
            {artwork.length ? <div>{artwork.map(art => <button type="button" key={art.url} aria-pressed={value.image_url === art.url}
              onClick={() => { setFailedURL(null); update('image_url',art.url); }}>{art.label}{value.image_url === art.url ? ' · selected' : ''}</button>)}</div>
              : <p>No saved artwork for this content. Upload an image below.</p>}
            <p>Landscape artwork works best for the hero. A portrait poster can be replaced with a dedicated background.</p>
          </div>}
          {size?.url === value.image_url && size.width < size.height && <p className="hero-editor-help" role="status">This is a portrait poster. Choose landscape artwork for a full-width hero.</p>}
          <ImageUploader appearance="light" label={value.image_url ? 'Replace artwork' : 'Upload artwork'} folder="hero" bucket={bucket}
            allowUrlImport onUploadSuccess={url => update('image_url', url)} onError={onError} />
          <p className="hero-editor-help">2560 × 1440 preferred · 1920 × 1080 minimum. JPG or WebP, ideally under 500 KB. Keep the subject to the right and space for text on the left.</p>
          <HeroVideoPicker value={value.video_url} onChange={url => update("video_url", url)} onBusyChange={setVideoBusy} />
          <details className="hero-editor-advanced">
            <summary>Advanced source URLs</summary>
            {field('image_url', 'Current image URL', 'https://…/artwork.jpg')}
            {field('video_url', 'Background video URL', 'https://…/loop.mp4')}
            <p className="hero-editor-help">Optional direct MP4. Starts muted; Apple TV viewers can select Sound on. The image remains the fallback. Changing a URL here updates the draft.</p>
          </details>
        </section>
        <section className="hero-editor-options" aria-label="Hero text and action">
          <div className="hero-editor-heading"><h3>Text & action</h3><span>Home screen</span></div>
          {field('title', 'Title', 'Give your hero a headline')}
          {field('subtitle', 'Description', 'A short introduction to this feature', true)}
          {field('badge', 'Eyebrow / badge', 'NEW · FEATURED · LIVE EVENT')}
          <div className="hero-editor-divider" />
          <label className="hero-editor-field" htmlFor={`${prefix}-action`}><span>Button destination</span>
            <select id={`${prefix}-action`} value={value.cta_type} onChange={e => onChange(current => ({...current,cta_type:e.target.value,cta_value:''}))}>
              <option value="none">No button</option><option value="movie">Movie</option><option value="show">Series</option>
              <option value="channel">Live channel</option><option value="podcast">Podcast</option><option value="tab">App section</option><option value="url">External URL</option>
            </select>
          </label>
          {value.cta_type !== 'none' && <>
            {field('cta_label', 'Button text', 'Watch now')}
            {value.cta_type === 'url' ? field('cta_value', 'Destination URL', 'https://…') : (
              <label className="hero-editor-field" htmlFor={`${prefix}-target`}><span>{value.cta_type === 'tab' ? 'Choose a section' : 'Choose content'}</span>
                <select id={`${prefix}-target`} value={value.cta_value} onChange={e => chooseContent(e.target.value)}>
                  <option value="">Choose…</option>
                  {value.cta_type === 'tab' ? [['Home','Home'],['Movies','Movies'],['Series','Series'],['Streams','Live TV'],['Podcasts','Podcasts']].map(([id,title]) => <option key={id} value={id}>{title}</option>) : list.map(item => <option key={item.id} value={item.id}>{item.title || item.name}</option>)}
                </select>
              </label>
            )}
          </>}
        </section>
      </div>
      <div className="hero-editor-footer">
        <label className="hero-editor-visibility"><input type="checkbox" checked={value.enabled} onChange={e => update('enabled',e.target.checked)} /><span><strong>Use custom Home hero</strong><small>{value.enabled ? 'Replaces the featured movie or series after saving.' : 'Home uses the featured movie or series.'}</small></span></label>
        <button type="button" className="hero-editor-save" onClick={onSave} disabled={saving || videoBusy}>{saving ? 'Saving…' : 'Save hero changes'}</button>
      </div>
    </div>
  );
}
