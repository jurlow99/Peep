import {useState} from 'react';
import './ChannelEditorLayout.css';
export default function ChannelEditorLayout({basics,source,artwork,access,presentation,tools,actions}){
 const [tab,setTab]=useState('details');
 const tabs=[['details','Channel details'],['source','Playback source'],['artwork','Artwork & layout'],['access','Access & availability'],['tools','Stream tools']];
 const section=(title,description,children)=><section className="channel-editor-section"><h3>{title}</h3><p className="channel-editor-hint">{description}</p>{children}</section>;
 return <div className="channel-editor"><nav aria-label="Channel settings">{tabs.map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 <div hidden={tab!=='details'}>{section('Channel details','Name and information viewers see.',basics)}</div>
 <div hidden={tab!=='source'}>{section('Playback source','Choose a linked feed or enter a playback URL.',source)}</div>
 <div hidden={tab!=='artwork'}>{section('Artwork & layout','Set the channel’s appearance on Live TV.',<>{artwork}<div className="channel-editor-divider"/><div className="channel-editor-fields">{presentation}</div></>)}</div>
 <div hidden={tab!=='access'}>{section('Access & availability','Control who can watch and when the channel is available.',<div className="channel-editor-fields">{access}</div>)}</div>
 {tab==='tools'&&section('Stream tools','Inspect the saved feed or manage optional program data. Save source changes before inspecting.',tools)}
 <footer className="channel-editor-actions">{actions}</footer></div>;
}
