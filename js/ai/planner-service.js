'use strict';

/* Builds a deliberately compact snapshot so planner usage stays predictable. */
const PlannerService = (() => {
  const MAX_DAYS = 24;
  const MAX_STOPS = 60;

  function buildContext(focusDayId = '') {
    const trip = Data.getCurrentTrip?.() || {};
    const allDays = Data.getDays?.() || [];
    const focus = allDays.find(d => d.id === focusDayId);
    const days = (focus ? [focus] : allDays.slice(0, MAX_DAYS)).map(day => ({
      date: day.date,
      label: day.label,
      title: day.title || '',
      locality: day.locality || '',
      overnight: Data.getOvernight?.(day.id)?.name || '',
      fixedItems: Data.getStopsByDay(day.id).slice(0, 8).map(stop => ({
        time: stop.time || '',
        name: stop.name,
        booked: stop.booking?.status === 'booked',
      })),
    }));

    let stopCount = 0;
    days.forEach(day => {
      const remaining = Math.max(0, MAX_STOPS - stopCount);
      day.fixedItems = day.fixedItems.slice(0, remaining);
      stopCount += day.fixedItems.length;
    });

    return {
      trip: {
        name: trip.name || Data.getTripName?.() || 'Trip',
        startDate: trip.start_date || allDays[0]?.date || null,
        endDate: trip.end_date || allDays.at(-1)?.date || null,
        countries: trip.countries || [],
        currency: trip.currency || Data.getTripCurrency?.() || 'USD',
        travellers: Data.getTravelers?.() || [],
      },
      days,
    };
  }

  async function suggest(message, focusDayId = '') {
    const clean = String(message || '').trim().slice(0, 1200);
    if (!clean) throw new Error('Tell the planner what you would like to do.');
    if (!navigator.onLine) throw new Error('AI planning needs an internet connection.');

    const { data, error } = await SB.functions.invoke('ai-planner', {
      body: { message: clean, context: buildContext(focusDayId) },
    });
    if (error) {
      let serverMessage = '';
      try { serverMessage = (await error.context?.json?.())?.error || ''; } catch (_) {}
      throw new Error(serverMessage || error.message || 'The planner could not respond.');
    }
    if (!data?.proposal) throw new Error(data?.error || 'The planner returned an invalid proposal.');
    return data.proposal;
  }

  async function trending(message, focusDayId = '') {
    const clean = String(message || '').trim().slice(0, 800);
    const day = (Data.getDays?.() || []).find(item => item.id === focusDayId) || (Data.getDays?.() || [])[0] || {};
    const response = await SB.functions.invoke('trending-places', { body: { message: clean, location: day.locality || Data.getTripName?.() || '', date: day.date || '', interests: clean } });
    if (response.error) throw new Error(response.error.message || 'Live place search failed.');
    if (!response.data?.result) throw new Error(response.data?.error || 'No trending places were found.');
    return response.data.result;
  }

  async function importScreenshot(file) {
    if (!file || !/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Choose one JPG or PNG screenshot.');
    const imageData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file); });
    const { data, error } = await SB.functions.invoke('ai-import', { body: { imageData, fileName: file.name } });
    if (error) throw new Error(error.message || 'Screenshot import failed.');
    if (!data?.result?.items) throw new Error(data?.error || 'The screenshot could not be understood.');
    return data.result;
  }

  return { suggest, trending, importScreenshot, buildContext };
})();

window.PlannerService = PlannerService;
