export const formatStreamBitrate=value=>value==null?'Not measured':`${(value/1000).toLocaleString(undefined,{maximumFractionDigits:1})} kb/s`;
export default function StreamPMT({report}){
 const programs=[...new Set(report.tracks.map(t=>t.program))];
 const groups=programs.length?programs:[null];
 return <div className="stream-pmt"><h4>Stream information (PMT)</h4><p>{report.sampleNote}</p>
 {groups.map(program=>{
  const tracks=report.tracks.filter(t=>t.program===program),pmt=tracks.find(t=>t.pmtPID!=null)?.pmtPID;
  return <section className="stream-pmt-group" key={program??'unavailable'}>
   <header><strong>PMT: {pmt??'Not decoded'}{program!=null?` · Program ${program}`:''}</strong><span>Last sampled: {new Date(report.checkedAt).toLocaleString()}</span></header>
   <div className="stream-inspector-table"><table><thead><tr>{['Type','Detected','PID','Codec','ISO-639','Options','Bitrate'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
   <tr><th scope="row">Bitrate</th><td>{report.bitrate!=null?<>{formatStreamBitrate(report.bitrate)}<small>Measured over {report.sampleDuration?.toFixed(2)}s</small></>:report.selected?.bandwidth!=null?<>{formatStreamBitrate(report.selected.bandwidth)}<small>Advertised rendition total</small></>:'Not advertised'}</td><td colSpan={5}/></tr>
   <tr><th scope="row">Framerate</th><td>{report.selected?.frameRate!=null?<>{report.selected.frameRate} fps<small>Advertised</small></>:'Not advertised'}</td><td colSpan={5}/></tr>
   {tracks.map(t=><tr key={t.pid}><th scope="row">{t.type==='SCTE-35'?'SCTE-35':t.type}</th><td>PMT declared{t.packetCount!=null&&<small>{t.packetCount} packets in sample</small>}{t.type==='SCTE-35'&&t.sectionCount!=null&&<small>{t.sectionCount} valid sections</small>}</td><td>{t.pid}</td><td>{t.codec}</td><td>{t.language||'—'}</td><td>{t.type==='Video'?<>{report.selected?.resolution||'Not advertised'}{report.selected?.resolution&&<small>Highest-bandwidth rendition size</small>}</>:'—'}</td><td>{formatStreamBitrate(t.bitrate)}{t.bitrate!=null&&<small>Measured · TS packet rate</small>}</td></tr>)}
   {!tracks.length&&<tr><td colSpan={7}>No track table decoded in this sample.</td></tr>}
   </tbody></table></div>
  </section>;
 })}
 <p>Track data comes from the highest-bandwidth advertised rendition when available. Measured rates use transport packet bytes over the complete segment’s declared media duration, including transport overhead. Partial samples remain unmeasured. A declared SCTE-35 track may have zero packets in the sample; it does not confirm a break message.</p>
 {report.invalidSections>0&&<p>{report.invalidSections} invalid-checksum sections ignored.</p>}
 </div>;
}
