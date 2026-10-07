const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

// 1. Add fetching of battery_swaps, home_cycles, battery_tests
const fetchReplacement = `      const { data: maintData, error: maintError } = await supabase
        .from('maintenance')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: true });
        
      if (maintError) throw maintError;

      const { data: swapsData } = await supabase.from('battery_swaps').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });
      const { data: homeCyclesData } = await supabase.from('home_cycles').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });
      const { data: batteryTestsData } = await supabase.from('battery_tests').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true });

      const result = {
        routine: {},    // { staffName: [{ cycle_id, condition, issue, parts_checked, odometer }] }
        pretask: {},    // same structure
        overall: { staff: dailyAssignments.overall || 'Not assigned today', cycles: [] },
        station: { staff: dailyAssignments.station || 'Not scheduled today', cycles: [] },
        maintenance: [],
        battery_swaps: swapsData || [],
        home_cycles: homeCyclesData || [],
        battery_tests: batteryTestsData || []
      };`;

code = code.replace(/const { data: maintData, error: maintError } = await supabase[\s\S]*?result = \{[\s\S]*?maintenance: \[\]\n\s*\};/, fetchReplacement);

// 2. Add sections to the report layout
const renderReplacement = `              {/* Section 8: Mechanical Repair */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">8. Mechanical Repair Work</h3>
                {overrides.mechanical.trim() ? (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4 whitespace-pre-wrap">{overrides.mechanical}</p>
                ) : (
                  <p className="text-sm leading-relaxed text-gray-900 mb-4">
                    {maintenance.length === 0
                      ? 'No mechanical repair work was submitted for this shift.'
                      : \`The maintenance team submitted \${recordLabel(maintenance.length, 'repair activity')}. Each record below identifies the cycle, responsible staff member, and the repair or fix description entered during the shift.\`}
                  </p>
                )}
                {maintenance.length > 0 && (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-20">Cycle</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900 w-24">Staff</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Repair Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenance.map((row, i) => (
                        <tr key={\`maint-\${i}\`}>
                          <td className="border border-gray-400 py-2 px-3 font-bold text-gray-900">{row.cycleId}</td>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.staffName}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.fix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 9: Battery Swaps */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">9. Battery Swaps</h3>
                {!data.battery_swaps || data.battery_swaps.length === 0 ? (
                  <p className="text-sm text-gray-900">No battery swaps were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Staff</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle / Category</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">In Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Out Battery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.battery_swaps.map((row, i) => (
                        <tr key={\`swap-\${i}\`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.staff_name}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.cycle_id || 'N/A'} {row.category ? \`(\${row.category})\` : ''}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.in_battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.out_battery_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 10: Home Cycles */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">10. Home Cycles</h3>
                {!data.home_cycles || data.home_cycles.length === 0 ? (
                  <p className="text-sm text-gray-900">No home cycles were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Name</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Cycle</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Old Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">New Battery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.home_cycles.map((row, i) => (
                        <tr key={\`home-\${i}\`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.manual_name}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.home_cycle_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.old_battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.new_battery_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 11: Battery Tests */}
              <div className="mb-12 break-inside-avoid">
                <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-900 pb-2">11. Battery Tests</h3>
                {!data.battery_tests || data.battery_tests.length === 0 ? (
                  <p className="text-sm text-gray-900">No battery tests were submitted for this shift.</p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Staff</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Battery</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Condition</th>
                        <th className="border border-gray-400 py-2 px-3 font-semibold text-gray-900">Fix/Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.battery_tests.map((row, i) => (
                        <tr key={\`test-\${i}\`}>
                          <td className="border border-gray-400 py-2 px-3 font-medium text-gray-900">{row.staff_name}</td>
                          <td className="border border-gray-400 py-2 px-3 font-mono text-gray-900">{row.battery_id || '—'}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.condition}</td>
                          <td className="border border-gray-400 py-2 px-3 text-gray-900">{row.fix_description || row.issue || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>`;

code = code.replace(/\{\/\* Section 8: Mechanical Repair \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, renderReplacement + '\n            </div>\n          </div>\n        </div>');

// 3. Update global fetch to include battery_tests
const globalFetchTarget = `const { data: homes } = await supabase.from('home_cycles').select('*').order('created_at', { ascending: false }).limit(1000);`;
const globalFetchReplacement = `const { data: homes } = await supabase.from('home_cycles').select('*').order('created_at', { ascending: false }).limit(1000);
      const { data: btests } = await supabase.from('battery_tests').select('*').order('created_at', { ascending: false }).limit(1000);`;

code = code.replace(globalFetchTarget, globalFetchReplacement);

const globalCombineTarget = `         ...(homes || []).map(h => ({
           id: h.id,
           task_type: 'Home Cycle',
           staff_name: h.manual_name,
           cycle_id: h.home_cycle_id || h.old_battery_id,
           created_at: h.created_at,
           source: 'home_cycles'
         }))`;
const globalCombineReplacement = `         ...(homes || []).map(h => ({
           id: h.id,
           task_type: 'Home Cycle',
           staff_name: h.manual_name,
           cycle_id: h.home_cycle_id || h.old_battery_id,
           created_at: h.created_at,
           source: 'home_cycles'
         })),
         ...(btests || []).map(b => ({
           id: b.id,
           task_type: 'Battery Test',
           staff_name: b.staff_name,
           cycle_id: b.battery_id,
           created_at: b.created_at,
           fix_description: b.condition + (b.issue ? ' - ' + b.issue : '') + (b.fix_description ? ' - ' + b.fix_description : ''),
           source: 'battery_tests'
         }))`;

code = code.replace(globalCombineTarget, globalCombineReplacement);

fs.writeFileSync('src/components/AdminDashboard.jsx', code);
