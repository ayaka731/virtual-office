import { useState, useEffect, useRef, useCallback } from "react";

const mkPal = (hair,hairL,skin,skinS,eye,outfit,outfitL,outfitD,acc,mouth) => ({
  o:"#1a1020",h:hair,l:hairL,s:skin,d:skinS,e:eye,u:outfit,t:outfitL,v:outfitD,a:acc,w:"#FFFFFF",m:mouth
});

const CHARS = {};

const addChar = (key,name,role,skill,dept,pal,isFemale) => {
  const h = isFemale ? [
    "____ohhhhho_____",
    "___ohhlhhlhho___",
    "__ohhhlhhhhlhho_",
    "__ohhohhhhhoho__",
  ] : [
    "____ohhhhho_____",
    "___ohhhlllhho___",
    "___ohhhhhhhho___",
    "___oossssssoo___",
  ];
  const face = [
    "___ossssssso____",
    "___osoessoeso___",
    "___ossssssso____",
    "___ossdmmdssso__",
    "____ossssssso___",
  ];
  const body = [
    "_____oooooo_____",
    "___oouuttuuoo___",
    "__ouuuuuuuuuuo__",
    "__ouuauuuuauuo__",
    "__ouuuuuuuuuuo__",
    "___ovvuuuuvvo___",
    "____ovuuuuvo____",
  ];
  // 3フレーム歩行: 立ち・右足・左足
  const legsStand = [
    "____ossooosso___",
    "____ovvo_ovvo___",
    "___ooo___oooo___",
  ];
  const legsR = [
    "____ossoosso____",
    "___ovvoo_ovvo___",
    "__ooo____oooo___",
  ];
  const legsL = [
    "____ossooosso___",
    "____ovvo__ovvo__",
    "___oooo____ooo__",
  ];
  const parse = row => row.split("").map(c => c === "_" ? null : c);
  CHARS[key] = {
    name, role, skill, dept, pal,
    frames:  [...h, ...face, ...body, ...legsStand].map(parse),
    walkR:   [...h, ...face, ...body, ...legsR].map(parse),
    walkL:   [...h, ...face, ...body, ...legsL].map(parse),
  };
};

addChar("misaki","ミサキ","企画長","トレンド分析","planning", mkPal("#8B2020","#C04040","#FDDCB4","#D4A878","#203060","#CC3333","#E85050","#991A1A","#FFD700","#E07070"), true);
addChar("kenta","ケンタ","データ分析","PV/CTR分析","planning", mkPal("#2C2C3C","#444458","#FDDCB4","#D4A878","#203060","#336699","#4488BB","#1A4466","#88BBEE","#D08888"), false);
addChar("yui","ユイ","スケジュール","投稿タイミング","planning", mkPal("#654321","#8B6B45","#FDDCB4","#D4A878","#203060","#FF69B4","#FF8DC0","#CC4488","#FFB6C1","#D08888"), true);
addChar("haruka","ハルカ","調査官","一次情報収集","research", mkPal("#1A1A2A","#333348","#FDDCB4","#D4A878","#203060","#2F4F4F","#4A6F6F","#1A3333","#DAA520","#D08888"), true);
addChar("takumi","タクミ","競合分析","上位記事分析","research", mkPal("#333344","#555568","#FDDCB4","#D4A878","#203060","#1C1C2C","#3C3C4C","#0A0A1A","#4169E1","#D08888"), false);
addChar("rin","リン","法規制","景表法チェック","research", mkPal("#2E6B47","#4E9B67","#FDDCB4","#D4A878","#203060","#3CB371","#5CD391","#1A8844","#98FB98","#D08888"), true);
addChar("aoi","アオイ","ライター","note記事執筆","writing", mkPal("#191950","#2929A0","#FDDCB4","#D4A878","#203060","#4169E1","#6189FF","#2244AA","#87CEEB","#D08888"), true);
addChar("sora","ソラ","SNS","X/IG投稿","writing", mkPal("#A0621E","#D08240","#FDDCB4","#D4A878","#203060","#FF8C00","#FFAC40","#CC6600","#FFA500","#D08888"), false);
addChar("rei","レイ","動画台本","TikTok台本","writing", mkPal("#600080","#9030B0","#FDDCB4","#D4A878","#203060","#9932CC","#BB55EE","#6622AA","#DDA0DD","#D08888"), true);
addChar("makoto","マコト","SEO","SEOスコア採点","review", mkPal("#2F3F3F","#4F5F5F","#FDDCB4","#D4A878","#203060","#556B2F","#758B4F","#334411","#AABB77","#D08888"), false);
addChar("sakura","サクラ","法務","コンプライアンス","review", mkPal("#1A1A2A","#333348","#FDDCB4","#D4A878","#203060","#DC143C","#FF3455","#AA0022","#FFB7C5","#D08888"), true);
addChar("hiro","ヒロ","品質","文章品質","review", mkPal("#3C3C4C","#5C5C6C","#FDDCB4","#D4A878","#203060","#696969","#898989","#444444","#C0C0C0","#D08888"), false);
addChar("natsuki","ナツキ","承認","GO/NG判断","review", mkPal("#B8860B","#D8A62B","#FDDCB4","#D4A878","#203060","#B8860B","#D8A62B","#886600","#FFD700","#D08888"), true);
addChar("kai","カイ","配信","4PF投稿","distribution", mkPal("#3062B4","#5082D4","#FDDCB4","#D4A878","#203060","#1E90FF","#40B0FF","#0066CC","#00BFFF","#D08888"), false);
addChar("miku","ミク","分析","パフォーマンス","distribution", mkPal("#CC1473","#EE3493","#FDDCB4","#D4A878","#203060","#C71585","#E735A5","#991166","#FF69B4","#D08888"), true);

const DEPTS = {
  planning:     { name:"企画部",    color:"#CC3333", chars:["misaki","kenta","yui"] },
  research:     { name:"リサーチ部", color:"#339966", chars:["haruka","takumi","rin"] },
  writing:      { name:"執筆部",    color:"#4169E1", chars:["aoi","sora","rei"] },
  review:       { name:"校正部",    color:"#CC9933", chars:["makoto","sakura","hiro","natsuki"] },
  distribution: { name:"配信部",    color:"#9932CC", chars:["kai","miku"] },
};
const PIPE = ["planning","research","writing","review","distribution"];

// キャラクター個別のセリフ一覧
const CHAR_LINES = {
  misaki:  ["KW候補を20個生成中…","テーマ決定！副業ガイド","ペルソナ設定完了✓","季節性チェック中…","月間3,200検索確認！"],
  kenta:   ["CTR予測: 3.2%","検索Vol計測中…","競合強度: MEDIUM","ロングテール抽出中","内部リンク候補5件"],
  yui:     ["8:00→G1に設定","投稿間隔を調整中…","IG: 21:00予約完了","スケジュール最適化中","G1→G2ローテ設定"],
  haruka:  ["公式サイト調査中…","口コミ50件収集完了","最新報酬を確認中","Yahoo知恵袋チェック中","信頼度: HIGH✓"],
  takumi:  ["上位10記事を分析中","競合弱点を発見！","差別化ポイント抽出","文字数: 3,500目標","FAQ不足を確認！"],
  rin:     ["景表法チェック中…","NGワード3件を検出","代替表現を提案中","PR表記位置OK✓","リスクレベル: LOW"],
  aoi:     ["H2×6本を執筆中…","リード文500字完成！","アフィリンク挿入中","まとめセクション執筆","文字数: 3,200字✓"],
  sora:    ["Xスレッド10本作成","フック文3案を生成","IGキャプション完成","ハッシュタグ25個✓","スレッド投稿順確認"],
  rei:     ["TikTok台本執筆中…","60秒構成が完成！","テロップ原稿を作成","フック: 3秒で勝負","ナレーション確認中"],
  makoto:  ["SEOスコア計測中…","KW密度チェック完了","H2にサブKW確認中","スコア: 87/100 ✓","メタdesc 120字OK"],
  sakura:  ["PR表記を確認中…","景表法チェック完了","断定表現なし確認","法務リスク: LOW✓","免責事項OK✓"],
  hiro:    ["誤字脱字チェック中","漢字率: 28% 適正","1文60字以内OK✓","品質スコア: 91点","読みやすさ: 良好✓"],
  natsuki: ["全スコアを照合中…","SEO87/法務LOW/品91","基準クリアを確認！",">>> GO判定! <<<","ファイルを保存中…"],
  kai:     ["note投稿を実行中…","Xスレッド投稿中","IG 21:00予約完了","TikTok台本を保存","投稿URLを記録中"],
  miku:    ["PV計測を開始…","CTR: +15%上昇！","保存数が伸びてる！","週次レポート生成中","次週テーマを提案中"],
};

const MSGS = {
  planning:["KW調査: 在宅副業 始め方","ペルソナ: 28歳OL 副業興味あり","テーマ決定: チャトレ始め方","季節性チェック完了","検索Vol 月間3,200"],
  research:["上位10記事 見出し構造抽出","口コミ50件 感情分析 pos:72%","景表法 要注意3件検出","最新報酬体系確認完了","競合弱点: 古い情報のまま"],
  writing:["note H2×6本で執筆開始","Xスレッド10本 フック3案","IGカルーセル 10枚設計","TikTok台本 60秒版作成中","アフィリンク 中盤に挿入"],
  review:["SEO: 87/100 PASS","法務: LOW PR表記確認済","品質: 91/100 良好","FINAL: >>> GO <<<","全基準クリア✓"],
  distribution:["note投稿完了 PV計測開始","Xスレッド 6/10投稿済","IG 21:00 予約投稿セット","TikTok台本 保存完了","週次: CTR+15% CVR+8%"],
};

// キャラクターの吹き出し
function Bubble({ text, color, visible }) {
  if (!visible || !text) return null;
  return (
    <div style={{
      position:"absolute", bottom:"calc(100% + 6px)", left:"50%",
      transform:"translateX(-50%)",
      background:"#fff", border:"2px solid #222",
      borderRadius:3, padding:"3px 6px",
      fontSize:8, color:"#111",
      whiteSpace:"nowrap", zIndex:10,
      fontFamily:"'DotGothic16'",
      boxShadow:"2px 2px 0 #000",
      pointerEvents:"none",
    }}>
      {text}
      {/* 吹き出しの三角 外枠 */}
      <div style={{
        position:"absolute", top:"100%", left:"50%",
        transform:"translateX(-50%)",
        width:0, height:0,
        borderLeft:"5px solid transparent",
        borderRight:"5px solid transparent",
        borderTop:"6px solid #222",
      }}/>
      {/* 吹き出しの三角 内側白 */}
      <div style={{
        position:"absolute", top:"calc(100% - 1px)", left:"50%",
        transform:"translateX(-50%)",
        width:0, height:0,
        borderLeft:"4px solid transparent",
        borderRight:"4px solid transparent",
        borderTop:"5px solid #fff",
      }}/>
    </div>
  );
}

// スプライト描画
function Sprite({ charKey, scale=3, active=false, walkPhase=0 }) {
  const ref = useRef(null);
  const ch = CHARS[charKey];
  useEffect(() => {
    if (!ref.current || !ch) return;
    const c = ref.current.getContext("2d");
    c.clearRect(0, 0, 16*scale, 19*scale);
    c.globalAlpha = active ? 1 : 0.3;
    // 0=立ち, 1=右足, 2=左足
    const rows = walkPhase === 1 ? ch.walkR : walkPhase === 2 ? ch.walkL : ch.frames;
    rows.forEach((row, y) => {
      row.forEach((px, x) => {
        if (!px) return;
        const color = ch.pal[px];
        if (!color) return;
        c.fillStyle = color;
        c.fillRect(x*scale, y*scale, scale, scale);
      });
    });
  }, [ch, scale, active, walkPhase]);
  if (!ch) return null;
  return <canvas ref={ref} width={16*scale} height={19*scale}
    style={{ imageRendering:"pixelated", display:"block" }} />;
}

// キャラクター1体（歩き＋吹き出し）
function CharUnit({ ck, dept, active, wf, onChar, lineIdx }) {
  const ch = CHARS[ck];
  // キャラごとに位相をずらして独立歩行
  const seed = ck.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const period = 8 + (seed % 5);           // 歩行周期（ステップ数）
  const phase  = seed % period;             // 位相オフセット
  const t = (wf + phase) % (period * 2);   // 往復タイマー
  const dir = t < period ? 1 : -1;         // 方向: 1=右, -1=左
  const posX = active ? (dir * ((t % period) / period) * 18 - 9) : 0;
  const walkPhase = active ? ((wf % 2) + 1) : 0; // 1 or 2 交互

  const lines = CHAR_LINES[ck] || [];
  const bubbleText = active ? lines[lineIdx % lines.length] : null;

  return (
    <div onClick={() => onChar(ck)} style={{
      cursor:"pointer", textAlign:"center", position:"relative",
      display:"flex", flexDirection:"column", alignItems:"center",
      paddingTop:28,  // 吹き出し用スペース
    }}>
      <Bubble text={bubbleText} color={dept.color} visible={active && !!bubbleText} />
      <div style={{
        transform:`translateX(${posX}px)`,
        transition:"transform 0.35s steps(1)",
        border: active ? `1px solid ${dept.color}55` : "1px solid transparent",
        background: active ? `${dept.color}0a` : "transparent",
        padding:2, borderRadius:2,
      }}>
        <Sprite charKey={ck} scale={3} active={active} walkPhase={active ? walkPhase : 0} />
      </div>
      <div style={{ fontFamily:"'DotGothic16'",fontSize:9,marginTop:2,color:active?"#ddd":"#252535" }}>{ch.name}</div>
      <div style={{ fontFamily:"'Press Start 2P'",fontSize:4,color:active?dept.color:"#1a1a28" }}>{ch.role}</div>
    </div>
  );
}

function Room({ dk, dept, active, msg, wf, lineIdx, onChar }) {
  return (
    <div style={{
      background: active ? "#161628" : "#0c0c16",
      border:`2px solid ${active ? dept.color : "#181828"}`,
      padding:10, position:"relative", overflow:"visible",
      boxShadow: active ? `0 0 16px ${dept.color}33, inset 0 0 30px ${dept.color}0a` : "none",
      transition:"all 0.4s",
    }}>
      {/* 床タイル */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,height:22,
        background: active
          ? "repeating-linear-gradient(90deg,#1a1a2a 0,#1a1a2a 15px,#202038 15px,#202038 16px)"
          : "#0a0a14",
        borderTop:`1px solid ${active?"#2a2a40":"#121220"}`,
      }}/>
      {/* 部署名 */}
      <div style={{
        fontFamily:"'Press Start 2P'",fontSize:6,marginBottom:4,
        display:"flex",justifyContent:"space-between",
        color:active?dept.color:"#252538",
      }}>
        <span>{dept.name}</span>
        {active && <span style={{color:"#0f0",fontSize:5,animation:"bl 0.8s steps(1) infinite"}}>ACTIVE</span>}
      </div>
      {/* キャラ列 */}
      <div style={{
        display:"flex",gap:dept.chars.length>3?4:10,
        justifyContent:"center",padding:"0 0 18px",
        position:"relative",zIndex:2,
        minHeight:90,
      }}>
        {dept.chars.map(ck => (
          <CharUnit key={ck} ck={ck} dept={dept} active={active}
            wf={wf} onChar={onChar} lineIdx={lineIdx} />
        ))}
      </div>
      {/* 部署メッセージ（下部） */}
      {active && msg && (
        <div style={{
          position:"relative",zIndex:3,margin:"2px 0 0",padding:"4px 8px",
          background:"#000010",border:"2px solid #888",borderRadius:3,
          boxShadow:"inset 2px 2px 0 #1a1a2a, inset -2px -2px 0 #1a1a2a",
          fontSize:10,color:"#eee",fontFamily:"'DotGothic16'",
        }}>
          <span style={{color:dept.color}}>▸ </span>{msg}
          <span style={{animation:"bl 0.5s steps(1) infinite"}}>▌</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState(-1);
  const [logs, setLogs] = useState([]);
  const [sel, setSel] = useState(null);
  const [wf, setWf] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [arts, setArts] = useState([]);
  const [botRunning, setBotRunning] = useState(false);
  const [pipeAge, setPipeAge] = useState(Infinity);
  const [activeMsg, setActiveMsg] = useState({});
  const [uptime, setUptime] = useState(0);
  const lr = useRef(null);
  const bootTime = useRef(Date.now());

  // APIポーリング（2秒ごと）
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setStage(data.stage);
        setArts(data.articles || []);
        setBotRunning(data.botRunning);
        setPipeAge(data.pipeAge);
        if (data.activeMsg) setActiveMsg(prev => ({ ...prev, [PIPE[data.stage]]: data.activeMsg }));
        setLogs(data.logs.map((l,i) => ({ ...l, k: i + l.ts + l.m })));
      } catch(e) {}
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if(lr.current) lr.current.scrollTop = lr.current.scrollHeight; }, [logs]);

  // 歩行アニメ（0.35s）
  useEffect(() => { const iv=setInterval(()=>setWf(f=>f+1),350); return()=>clearInterval(iv); }, []);

  // セリフ（1.8s）
  useEffect(() => { const iv=setInterval(()=>setLineIdx(i=>i+1),1800); return()=>clearInterval(iv); }, []);

  // 起動時間
  useEffect(() => { const iv=setInterval(()=>setUptime(Math.floor((Date.now()-bootTime.current)/1000)),1000); return()=>clearInterval(iv); }, []);

  const pub   = arts.filter(a=>a.status==='published').length;
  const done  = arts.filter(a=>a.p===100).length;
  const ft    = s => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const isActive = stage >= 0;

  const lc = (l) => {
    const m = l.m || '';
    if (l.src==='bot' && /起動完了|スケジュール/.test(m)) return "#0f0";
    if (/GO|PASS|完了|success/i.test(m)) return "#FFD700";
    if (/エラー|失敗|ERROR|REJECT/i.test(m)) return "#f44";
    if (/PIPELINE/.test(m)) return "#0f0";
    const dept = PIPE.find(p => m.toLowerCase().includes(p));
    return dept ? DEPTS[dept].color : "#555";
  };

  const sc = sel ? CHARS[sel] : null;

  return (
    <div style={{background:"#08080f",height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Courier New',monospace",color:"#aaa",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=DotGothic16&display=swap');
        @keyframes bl{0%,100%{opacity:1}50%{opacity:0}}
        *::-webkit-scrollbar{width:4px}
        *::-webkit-scrollbar-track{background:#0a0a12}
        *::-webkit-scrollbar-thumb{background:#222}
      `}</style>
      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:999,
        background:"repeating-linear-gradient(0deg,rgba(0,0,0,0.1) 0px,rgba(0,0,0,0.1) 1px,transparent 1px,transparent 3px)"}}/>

      {/* ヘッダー */}
      <div style={{background:"#111118",borderBottom:"2px solid #FFD700",padding:"7px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:"'Press Start 2P'",fontSize:8,color:"#FFD700"}}>VIRTUAL OFFICE</span>
          <span style={{fontSize:7,color:isActive?"#0f0":botRunning?"#FFD700":"#f44",
            border:`1px solid ${isActive?"#0f0":botRunning?"#FFD700":"#f44"}`,padding:"1px 4px",
            animation:isActive?"bl 0.8s steps(1) infinite":"none"}}>
            {isActive?"RUNNING":botRunning?"BOT ON":"IDLE"}
          </span>
          {pipeAge < 60 && (
            <span style={{fontSize:6,color:"#555",fontFamily:"'Press Start 2P'"}}>
              {pipeAge}s ago
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          {[
            ["TIME","#0f0",ft(uptime)],
            ["DONE","#4ECDC4",String(done).padStart(3,"0")],
            ["FILES","#FFD700",String(arts.length).padStart(3,"0")],
          ].map(([l,c,v])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Press Start 2P'",fontSize:4,color:"#444"}}>{l}</div>
              <div style={{fontFamily:"'Press Start 2P'",fontSize:7,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* パイプライン進捗 */}
      <div style={{display:"flex",background:"#0a0a12",borderBottom:"1px solid #181828",padding:"4px 12px",gap:2,flexShrink:0}}>
        {PIPE.map((s,i)=>(
          <div key={s} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{
              flex:1,textAlign:"center",padding:"2px 0",
              background:i===stage?DEPTS[s].color+"33":"#0c0c16",
              border:`1px solid ${i===stage?DEPTS[s].color:"#151520"}`,
              color:i===stage?DEPTS[s].color:"#1a1a28",
              fontFamily:"'Press Start 2P'",fontSize:5,transition:"all 0.3s",
            }}>{DEPTS[s].name}</div>
            {i<4&&<span style={{color:i<stage?"#FFD700":"#151520",fontSize:7,margin:"0 1px"}}>&gt;</span>}
          </div>
        ))}
      </div>

      <div style={{display:"flex",flex:1,minHeight:0}}>
        {/* 部署グリッド */}
        <div style={{flex:1,padding:8,overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Object.entries(DEPTS).map(([dk,d])=>(
              <Room key={dk} dk={dk} dept={d} active={PIPE[stage]===dk}
                msg={activeMsg[dk]} wf={wf} lineIdx={lineIdx} onChar={setSel} />
            ))}
          </div>
        </div>

        {/* サイドパネル */}
        <div style={{width:230,flexShrink:0,background:"#0a0a14",borderLeft:"2px solid #181828",
          display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* キャラ詳細 */}
          <div style={{padding:8,borderBottom:"1px solid #181828",flexShrink:0}}>
            <div style={{fontFamily:"'Press Start 2P'",fontSize:5,color:"#FFD700",marginBottom:4}}>STATUS</div>
            {sc ? (
              <div style={{border:"2px solid #888",borderRadius:3,padding:6,background:"#000010",
                boxShadow:"inset 2px 2px 0 #1a1a2a"}}>
                <div style={{display:"flex",gap:8}}>
                  <div style={{border:"1px solid #333",background:"#0a0a14",padding:3,flexShrink:0}}>
                    <Sprite charKey={sel} scale={4} active={true} walkPhase={wf%2+1}/>
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontFamily:"'DotGothic16'",fontSize:14,color:"#fff"}}>{sc.name}</div>
                    <div style={{fontFamily:"'Press Start 2P'",fontSize:5,color:DEPTS[sc.dept]?.color,marginTop:1}}>{sc.role}</div>
                    <div style={{fontSize:8,color:"#4ECDC4",marginTop:4,fontFamily:"'DotGothic16'"}}>{sc.skill}</div>
                    <div style={{fontSize:9,color:"#888",marginTop:3,fontFamily:"'DotGothic16'",
                      borderTop:"1px solid #1a1a2a",paddingTop:3}}>
                      {CHAR_LINES[sel]?.[lineIdx % CHAR_LINES[sel].length]}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{color:"#1a1a28",fontSize:9,textAlign:"center",padding:10,fontFamily:"'DotGothic16'"}}>
                キャラをクリック
              </div>
            )}
          </div>

          {/* 記事クエスト */}
          <div style={{padding:8,borderBottom:"1px solid #181828",flexShrink:0}}>
            <div style={{fontFamily:"'Press Start 2P'",fontSize:5,color:"#4ECDC4",marginBottom:4}}>QUEST</div>
            {arts.length===0 ? (
              <div style={{color:"#1a1a28",fontFamily:"'DotGothic16'",fontSize:9,textAlign:"center",padding:8}}>
                記事なし<span style={{animation:"bl 1s steps(1) infinite"}}>_</span>
              </div>
            ) : arts.slice(0,5).map(a=>(
              <div key={a.id} style={{marginBottom:4,background:"#0c0c18",
                border:`1px solid ${a.status==='published'?"#0f055":"#181828"}`,padding:5}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontFamily:"'Press Start 2P'",fontSize:4,color:a.g==="G1"?"#CC3333":"#4169E1"}}>{a.id}</span>
                  <span style={{fontFamily:"'Press Start 2P'",fontSize:4,
                    color:a.status==='published'?"#0f0":a.p>=100?"#4ECDC4":"#555"}}>
                    {a.status==='published'?"PUB":a.p>=100?"DONE":`${a.p}%`}
                  </span>
                </div>
                <div style={{fontFamily:"'DotGothic16'",fontSize:8,color:"#777",margin:"1px 0",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.t}</div>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{fontFamily:"'Press Start 2P'",fontSize:4,color:"#555"}}>HP</span>
                  <div style={{flex:1,height:5,background:"#151520",border:"1px solid #1a1a28"}}>
                    <div style={{height:"100%",width:`${a.p}%`,
                      background:a.status==='published'?"#0f0":a.p>=100?"#4ECDC4":a.p>50?"#FFD700":"#CC3333",
                      transition:"width 0.5s"}}/>
                  </div>
                </div>
                {a.platforms && (
                  <div style={{display:"flex",gap:2,marginTop:2}}>
                    {['note','x','instagram','tiktok'].map(pl=>(
                      <span key={pl} style={{fontFamily:"'Press Start 2P'",fontSize:3,
                        color:a.platforms.includes(pl)?"#FFD700":"#1a1a28"}}>
                        {pl==='instagram'?'ig':pl}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ログ */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
            <div style={{fontFamily:"'Press Start 2P'",fontSize:5,color:"#0f0",padding:"4px 8px",flexShrink:0}}>LOG</div>
            <div ref={lr} style={{flex:1,overflowY:"auto",padding:"0 8px",fontSize:8,lineHeight:1.6}}>
              {logs.length===0 ? (
                <div style={{color:"#181828",fontFamily:"'DotGothic16'"}}>
                  待機中<span style={{animation:"bl 1s steps(1) infinite"}}>_</span>
                </div>
              ) : logs.map(l=>(
                <div key={l.k} style={{color:lc(l)}}>
                  <span style={{color:"#2a2a38"}}>{l.ts}</span> {l.m}
                </div>
              ))}
            </div>
          </div>

          {/* アカウント */}
          <div style={{padding:"6px 8px",borderTop:"1px solid #181828",flexShrink:0}}>
            <div style={{fontFamily:"'Press Start 2P'",fontSize:4,color:"#333",marginBottom:4}}>ACCOUNTS</div>
            {[
              {label:"note", id:"yorushoku_500",   color:"#41C9B4"},
              {label:"X",    id:"tinzhnglil15017", color:"#1DA1F2"},
              {label:"IG",   id:"ruri_yorushoku",  color:"#E1306C"},
            ].map(a=>(
              <div key={a.label} style={{display:"flex",justifyContent:"space-between",fontSize:7,marginBottom:2,fontFamily:"'DotGothic16'"}}>
                <span style={{color:a.color}}>{a.label}</span>
                <span style={{color:"#3a3a4a"}}>@{a.id}</span>
              </div>
            ))}
          </div>
          <div style={{padding:6,borderTop:"1px solid #181828",textAlign:"center"}}>
            <div style={{fontFamily:"'Press Start 2P'",fontSize:4,color:"#1a1a28"}}>
              pipeline.log &gt;&gt; dashboard
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
