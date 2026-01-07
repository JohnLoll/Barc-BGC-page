import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Info, TrendingUp, Users, Award, ShoppingBag, AlertTriangle } from 'lucide-react';

const CONSTANTS = {
  GAR_BADGE_ID: 2124527902,
  BADGES_PER_PAGE: 30,
  ROBLOX_CREATOR_ID: 1
};

const BADGE_BLACKLIST = {
  GROUPS: [12812691, 33902982, 5088172, 15750958230, 11858305, 32488102, 13617167, 4705120, 5218018],
  KEYWORDS: ['obby', 'easy', 'free', 'quick', 'simple', 'fast', 'auto', 'afk', 'idle', 'click', 'simulator', 'tycoon', 'farm', 'grind', 'noob', 'pro', 'legend', 'master', 'expert', 'stage', 'camp', 'level', 'collect', 'find', 'touch', 'press', 'walk', 'run', 'jump', 'badge', 'drop', 'welcome', 'visitor']
};

export default function AltDetector() {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [avatarType, setAvatarType] = useState('full');
  const [error, setError] = useState(null);

  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const isValidBadge = (badge) => {
    if (!badge || !badge.displayName || !badge.creator?.id) return false;
    if (BADGE_BLACKLIST.GROUPS.includes(badge.creator.id)) return false;
    const clean = badge.displayName.replace(/\s/g, '');
    if (/^\d+$/.test(clean)) return false;
    const lower = badge.displayName.toLowerCase();
    return !BADGE_BLACKLIST.KEYWORDS.some(kw => lower.includes(kw));
  };

  const fetchAllBadges = async (userId) => {
    const badges = [];
    let cursor = null;
    let pageCount = 0;
    
    do {
      pageCount++;
      const url = `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        log(`Badge fetch failed on page ${pageCount}`, 'warning');
        break;
      }
      const json = await res.json();
      badges.push(...(json.data || []));
      cursor = json.nextPageCursor;
      
      if (pageCount % 5 === 0) {
        log(`Fetched ${badges.length} badges so far...`, 'info');
      }
      
      await new Promise(r => setTimeout(r, 50));
    } while (cursor);
    
    return badges;
  };

  const processBadges = async (allBadges) => {
    let validCount = 0;
    let filteredCount = 0;
    let garFound = false;
    let garPosition = null;

    const excludedCreators = new Set();
    const creatorCounts = new Map();

    log('Analyzing badge creators...', 'info');
    
    for (const b of allBadges) {
      const cid = b.creator?.id;
      if (cid) {
        const c = (creatorCounts.get(cid) || 0) + 1;
        creatorCounts.set(cid, c);
        if (c >= 50) excludedCreators.add(cid);
      }
    }

    log(`Found ${excludedCreators.size} creators with 50+ badges`, 'info');

    const validByCreator = new Map();

    for (const [i, badge] of allBadges.entries()) {
      if (badge.id === CONSTANTS.GAR_BADGE_ID) {
        garFound = true;
        garPosition = i;
        log('GAR badge found!', 'success');
      }

      const cid = badge.creator?.id;
      if (cid && excludedCreators.has(cid)) { 
        filteredCount++; 
        continue; 
      }

      if (!isValidBadge(badge)) { 
        filteredCount++; 
        continue; 
      }

      if (cid) {
        const list = validByCreator.get(cid) || [];
        if (list.length < 15) {
          list.push(badge);
          validByCreator.set(cid, list);
          validCount++;
        } else {
          filteredCount++;
        }
      } else {
        filteredCount++;
      }
    }

    const totalPages = Math.ceil(allBadges.length / CONSTANTS.BADGES_PER_PAGE);
    const garPage = garFound ? Math.floor(garPosition / CONSTANTS.BADGES_PER_PAGE) + 1 : null;
    const filteredPct = allBadges.length ? (filteredCount / allBadges.length * 100).toFixed(1) : 0;

    return {
      found: garFound,
      pageNumber: garPage,
      totalPages,
      totalBadges: validCount,
      filteredBadges: filteredCount,
      filteredPercentage: parseFloat(filteredPct),
      message: garFound ? `Page ${garPage} of ${totalPages}` : 'Not found'
    };
  };

  const fetchAllInventory = async (userId, apiKey) => {
    const inv = { shirts: 0, pants: 0, accessories: 0, gamepasses: 0, isPrivate: false };
    const types = [
      { k: 'shirts', f: 'CLASSIC_SHIRT', n: 'shirts' },
      { k: 'pants', f: 'CLASSIC_PANTS', n: 'pants' },
      { k: 'accessories', f: 'HAT', n: 'accessories' },
      { k: 'gamepasses', f: 'gamePasses=true', n: 'gamepasses' }
    ];

    for (const t of types) {
      log(`Fetching ${t.n}...`, 'info');
      let count = 0;
      let token = '';
      
      do {
        const filter = t.f === 'gamePasses=true' ? t.f : 'inventoryItemAssetTypes=' + t.f;
        const url = `https://apis.roblox.com/cloud/v2/users/${userId}/inventory-items?maxPageSize=100${token ? '&pageToken=' + token : ''}&filter=${filter}`;
        
        const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
        
        if (res.status === 403) {
          inv.isPrivate = true;
          log('Inventory is private (403)', 'warning');
          return inv;
        }
        
        if (!res.ok) {
          log(`Failed to fetch ${t.n}: HTTP ${res.status}`, 'error');
          break;
        }
        
        const json = await res.json();
        const items = json.inventoryItems || [];
        
        if (t.k === 'gamepasses') {
          count += items.filter(i => i.assetDetails?.createdBy?.id !== userId).length;
        } else {
          items.forEach(i => {
            if (i.assetDetails?.createdBy?.id === CONSTANTS.ROBLOX_CREATOR_ID) {
              if (t.k === 'accessories' && count < 5) count++;
            } else {
              count++;
            }
          });
        }
        
        token = json.nextPageToken || '';
      } while (token);
      
      inv[t.k] = count;
      log(`Found ${count} ${t.n}`, 'success');
    }
    
    return inv;
  };

  const calculateScore = (data) => {
    let score = 0;
    const reasons = [];
    const age = data.accountAge;
    const inv = data.inventory;
    const realBadges = data.realBadges;
    const gar = data.garBadge;
    const friends = data.friends;
    const filteredPct = gar.filteredPercentage;

    if (realBadges < 210) {
      score += 100;
      reasons.push('Auto-Fail: <210 real badges');
    }
    
    if (filteredPct >= 78 || (filteredPct >= 80 && realBadges < 750)) {
      score += 200;
      reasons.push(`Auto-Fail: ${filteredPct}% fake badges`);
    }

    if (gar.found) {
      const fromEnd = gar.totalPages - gar.pageNumber + 1;
      if (fromEnd <= 2) {
        score += 12;
        reasons.push('GAR badge very old (+12)');
      } else if (fromEnd <= 4) {
        score += 8;
        reasons.push('GAR badge old (+8)');
      } else if (fromEnd <= 6) {
        score += 4;
        reasons.push('GAR badge somewhat old (+4)');
      }
    }

    if (age < 7) {
      score += 35;
      reasons.push('Very new account (+35)');
    } else if (age < 30) {
      score += 25;
      reasons.push('New account (+25)');
    } else if (age < 90) {
      score += 15;
      reasons.push('Young account (+15)');
    }

    if (friends === 0) {
      score += 15;
      reasons.push('No friends (+15)');
    } else if (friends < 5) {
      score += 10;
      reasons.push(`Few friends (${friends}) (+10)`);
    }

    if (!inv.isPrivate) {
      const clothing = (inv.shirts || 0) + (inv.pants || 0);
      if (clothing === 0 && age > 30) {
        score += 15;
        reasons.push('No clothing (+15)');
      }
      if (inv.gamepasses < 5 && age > 180) {
        score += 12;
        reasons.push('Few gamepasses (+12)');
      }
    }

    let category = 'LOW';
    if (score >= 200) category = 'Auto-Failed (Fake Badges)';
    else if (score >= 100) category = 'Auto-Failed (Insufficient Badges)';
    else if (score >= 50) category = 'HIGH';
    else if (score >= 16) category = 'MEDIUM-HIGH';
    else if (score >= 8) category = 'MEDIUM';

    return { score, category, reasons };
  };

  const analyze = async () => {
    if (!username.trim()) {
      setError('Please enter a Roblox username');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter your Roblox Cloud API Key in the sidebar');
      return;
    }

    setError(null);
    setLoading(true);
    setLogs([]);
    log(`Starting analysis for: ${username}`, 'info');

    try {
      log('Fetching user ID...', 'info');
      const idRes = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username] })
      });
      
      const idData = await idRes.json();
      if (!idData.data?.length) {
        throw new Error('User not found');
      }
      
      const userId = idData.data[0].id;
      log(`Found user ID: ${userId}`, 'success');

      log('Fetching user profile...', 'info');
      const [userInfo, friends, followers, following, groups, avatarFull, avatarHeadRes] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).then(r => r.json()),
        fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`).then(r => r.json()),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png`).then(r => r.json()),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`).then(r => r.json())
      ]);

      log('Profile data received', 'success');
      log('Fetching badges...', 'info');
      
      const rawBadges = await fetchAllBadges(userId);
      log(`Fetched ${rawBadges.length} total badges`, 'success');
      
      log('Processing badges...', 'info');
      const garResult = await processBadges(rawBadges);
      log(`Valid badges: ${garResult.totalBadges}, Filtered: ${garResult.filteredBadges} (${garResult.filteredPercentage}%)`, 'success');

      log('Fetching inventory...', 'info');
      const inventory = await fetchAllInventory(userId, apiKey);
      
      if (inventory.isPrivate) {
        log('Inventory is private', 'warning');
      } else {
        log(`Inventory: ${inventory.shirts} shirts, ${inventory.pants} pants, ${inventory.accessories} accessories, ${inventory.gamepasses} gamepasses`, 'success');
      }

      const ageDays = Math.floor((Date.now() - new Date(userInfo.created)) / 86400000);

      const data = {
        userInfo,
        userId,
        accountAge: ageDays,
        friends: friends.count || 0,
        followers: followers.count || 0,
        following: following.count || 0,
        groups: groups.data?.length || 0,
        avatarLarge: avatarFull.data?.[0]?.imageUrl,
        avatarHead: avatarHeadRes.data?.[0]?.imageUrl,
        inventory,
        garBadge: garResult,
        realBadges: garResult.totalBadges
      };

      const { score, category } = calculateScore(data);
      log(`Analysis complete! Score: ${score}, Category: ${category}`, 'success');
      
      setUserData(data);
    } catch (err) {
      console.error(err);
      log(`Error: ${err.message}`, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getBadgeColor = (category) => {
    if (category.includes('Auto-Failed')) return 'bg-purple-600';
    if (category === 'HIGH') return 'bg-red-500';
    if (category === 'MEDIUM-HIGH') return 'bg-orange-500';
    if (category === 'MEDIUM') return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getAlertClass = (category) => {
    if (category.includes('Auto-Failed') || category === 'HIGH') return 'border-red-500 bg-red-950/40 text-red-400';
    if (category === 'LOW') return 'border-green-500 bg-green-950/40 text-green-400';
    return 'border-yellow-500 bg-yellow-950/40 text-yellow-400';
  };

  return (
    <div className="flex min-h-screen bg-[#0a0e27] text-gray-100">
      {/* Sidebar */}
      <aside className="w-80 bg-gradient-to-b from-slate-900 to-slate-800 p-6 flex flex-col shadow-2xl">
        <div className="text-xl font-extrabold mb-5 text-blue-400 text-center">Advanced Alt Detector</div>
        
        <div className="mb-5 p-4 bg-slate-900 rounded-xl border-2 border-slate-700">
          <div className="text-slate-400 text-xs mb-2 font-semibold">🔑 Roblox Cloud API Key</div>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (e.target.value) log('API Key configured', 'success');
            }}
            className="w-full px-3 py-2 rounded-lg border-2 border-slate-700 bg-slate-800 text-gray-100 text-xs font-mono focus:outline-none focus:border-blue-500"
            placeholder="rbx_cloud_..."
          />
          {apiKey && <div className="mt-2 text-xs text-green-400">✓ API Key Set</div>}
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {['overview', 'badges', 'inventory', 'social'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 rounded-lg text-left font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/40'
                  : 'bg-transparent text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col mt-5 min-h-0">
          <div className="text-slate-400 text-xs mb-2 font-semibold">📋 Activity Logs</div>
          <div className="flex-1 bg-slate-900 rounded-lg p-3 overflow-y-auto text-xs font-mono text-slate-300 border-2 border-slate-700 min-h-[200px]">
            {logs.map((log, i) => (
              <div key={i} className={`py-1.5 border-b border-slate-800 last:border-0 ${
                log.type === 'success' ? 'text-green-400' :
                log.type === 'error' ? 'text-red-400' :
                log.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'
              }`}>
                [{log.timestamp}] {log.message}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="mb-8 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex gap-3 flex-1">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyze()}
              placeholder="Enter Roblox username..."
              className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-700 bg-slate-800 text-gray-100 focus:outline-none focus:border-blue-500 transition-all"
            />
            <button
              onClick={analyze}
              disabled={loading}
              className="px-7 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze Account'}
            </button>
          </div>
          <div className="text-slate-400 text-sm px-4 py-2 bg-slate-800 rounded-lg">
            {loading ? 'Analyzing...' : userData ? 'Analysis complete!' : 'Ready — Enter a username and click Analyze'}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-5 border-2 border-red-500 bg-red-950/40 text-red-400 rounded-2xl">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[380px_1fr] gap-6">
          {/* User Card */}
          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <div className="flex flex-col items-center gap-5">
              {loading ? (
                <div className="w-60 h-60 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-600 animate-pulse" />
              ) : (
                <img
                  src={userData ? (avatarType === 'full' ? userData.avatarLarge : userData.avatarHead) : ''}
                  alt="User avatar"
                  className="w-60 h-60 rounded-2xl object-cover bg-slate-900 border-4 border-slate-700 shadow-2xl"
                  style={{ display: userData ? 'block' : 'none' }}
                />
              )}
              
              <div className="text-center w-full">
                <div className="text-2xl font-bold mb-1.5">{userData?.userInfo.displayName || '—'}</div>
                <div className="text-slate-400 mb-4">@{userData?.userInfo.name || '—'}</div>
                {userData?.userInfo.description && (
                  <div className="text-slate-300 text-sm leading-relaxed p-4 bg-slate-900 rounded-xl mt-3 max-h-36 overflow-y-auto">
                    {userData.userInfo.description}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 w-full mt-5">
                <div className="text-center p-4 bg-slate-900 rounded-xl">
                  <div className="text-slate-400 text-sm mb-1.5">Account Age</div>
                  <div className="text-2xl font-bold text-blue-400">{userData?.accountAge || '—'}d</div>
                </div>
                <div className="text-center p-4 bg-slate-900 rounded-xl">
                  <div className="text-slate-400 text-sm mb-1.5">Friends</div>
                  <div className="text-2xl font-bold text-blue-400">{userData?.friends ?? '—'}</div>
                </div>
                <div className="text-center p-4 bg-slate-900 rounded-xl">
                  <div className="text-slate-400 text-sm mb-1.5">Followers</div>
                  <div className="text-2xl font-bold text-blue-400">{userData?.followers ?? '—'}</div>
                </div>
                <div className="text-center p-4 bg-slate-900 rounded-xl">
                  <div className="text-slate-400 text-sm mb-1.5">Following</div>
                  <div className="text-2xl font-bold text-blue-400">{userData?.following ?? '—'}</div>
                </div>
              </div>

              {userData && (
                <div className="flex gap-3 w-full mt-5">
                  <button
                    onClick={() => setAvatarType('full')}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      avatarType === 'full'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40'
                        : 'bg-slate-900 text-slate-300 hover:border-blue-500 border-2 border-transparent'
                    }`}
                  >
                    Full Body
                  </button>
                  <button
                    onClick={() => setAvatarType('head')}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      avatarType === 'head'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40'
                        : 'bg-slate-900 text-slate-300 hover:border-blue-500 border-2 border-transparent'
                    }`}
                  >
                    Headshot
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Analysis Panel */}
          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <h2 className="text-2xl font-bold mb-5 text-gray-100">
              {activeTab === 'overview' ? 'Alt Risk Assessment' :
               activeTab === 'badges' ? 'Badge Analysis' :
               activeTab === 'inventory' ? 'Inventory' : 'Social Metrics'}
            </h2>

            {!userData ? (
              <div className="p-5 border-2 border-yellow-500 bg-yellow-950/40 text-yellow-400 rounded-2xl">
                Enter a Roblox username above and click Analyze to begin.
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (() => {
                  const { score, category, reasons } = calculateScore(userData);
                  return (
                    <>
                      <div className={`p-5 border-2 rounded-2xl mb-6 ${getAlertClass(category)}`}>
                        <strong className="flex items-center gap-2">
                          Alt Likelihood: 
                          <span className={`inline-block px-3.5 py-2 rounded-lg text-sm font-bold ${getBadgeColor(category)} text-white`}>
                            {category}
                          </span>
                        </strong>
                        <div className="mt-2.5 text-lg">Score: {score}+</div>
                      </div>

                      <div className="text-xl font-bold mb-5">Detection Reasons</div>
                      <ul className="space-y-2 mb-6">
                        {reasons.map((r, i) => (
                          <li key={i} className="p-3 bg-slate-900 rounded-lg border-l-4 border-blue-400">
                            {r}
                          </li>
                        ))}
                      </ul>

                      <div className="text-xl font-bold mb-5">Key Stats</div>
                      <div className="grid gap-3">
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">Age</span>
                          <span className="text-gray-100 font-semibold">{userData.accountAge} days</span>
                        </div>
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">Real Badges</span>
                          <span className="text-gray-100 font-semibold">{userData.realBadges}</span>
                        </div>
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">Fake %</span>
                          <span className="text-gray-100 font-semibold">{userData.garBadge.filteredPercentage}%</span>
                        </div>
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">GAR Badge</span>
                          <span className="text-gray-100 font-semibold">{userData.garBadge.message}</span>
                        </div>
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">Friends</span>
                          <span className="text-gray-100 font-semibold">{userData.friends}</span>
                        </div>
                        <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                          <span className="text-slate-400 font-medium">Groups</span>
                          <span className="text-gray-100 font-semibold">{userData.groups}</span>
                        </div>
                        {userData.inventory.isPrivate ? (
                          <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                            <span className="text-slate-400 font-medium">Inventory</span>
                            <span className="text-gray-100 font-semibold">Private</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                              <span className="text-slate-400 font-medium">Clothing</span>
                              <span className="text-gray-100 font-semibold">{userData.inventory.shirts + userData.inventory.pants}</span>
                            </div>
                            <div className="flex justify-between p-3.5 bg-slate-900 rounded-xl border-l-4 border-blue-500">
                              <span className="text-slate-400 font-medium">Gamepasses</span>
                              <span className="
