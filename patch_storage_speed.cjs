const fs = require('fs');
let file = fs.readFileSync('src/services/storage.ts', 'utf8');

// Patch 1: Make Supabase sync non-blocking in saveDailyReport
const syncBlock1 = `    // PERSIST DIRECTLY TO SUPABASE
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error: repErr } = await supabase.from('daily_reports').upsert(report);
        if (repErr) console.error('Supabase upsert daily_reports error:', repErr);

        if (newValues.length > 0) {
          const { error: valErr } = await supabase.from('daily_report_values').upsert(newValues);
          if (valErr) console.error('Supabase upsert daily_report_values error:', valErr);
        }
      } catch (err) {
        console.error('Supabase sync report error:', err);
      }
    }`;

const fastSyncBlock1 = `    // PERSIST DIRECTLY TO SUPABASE (Non-blocking for instant UI response)
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      Promise.resolve().then(async () => {
        try {
          const { error: repErr } = await supabase.from('daily_reports').upsert(report);
          if (repErr) console.error('Supabase upsert daily_reports error:', repErr);

          if (newValues.length > 0) {
            const { error: valErr } = await supabase.from('daily_report_values').upsert(newValues);
            if (valErr) console.error('Supabase upsert daily_report_values error:', valErr);
          }
        } catch (err) {
          console.error('Supabase sync report error:', err);
        }
      });
    }`;

file = file.replace(syncBlock1, fastSyncBlock1);

// Patch 2: Don't await addLog
const addLogBlock = `    await this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: oldReport ? 'UPDATE' : 'CREATE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: oldReport,
      new_data: { valuesByGroup, notes },
    });`;

const fastAddLogBlock = `    // Fire and forget log for instant UI
    this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: oldReport ? 'UPDATE' : 'CREATE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: oldReport,
      new_data: { valuesByGroup, notes },
    }).catch(console.error);`;

file = file.replace(addLogBlock, fastAddLogBlock);

// Patch 3: Make Supabase sync non-blocking in addLog
const addLogSupabaseBlock = `    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('system_logs').insert(item);
      } catch (e) {
        console.error('Supabase addLog error:', e);
      }
    }`;

const fastAddLogSupabaseBlock = `    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      Promise.resolve().then(async () => {
        try {
          await supabase.from('system_logs').insert(item);
        } catch (e) {
          console.error('Supabase addLog error:', e);
        }
      });
    }`;

file = file.replace(addLogSupabaseBlock, fastAddLogSupabaseBlock);

fs.writeFileSync('src/services/storage.ts', file);
