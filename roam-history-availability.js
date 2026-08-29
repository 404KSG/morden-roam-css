(() => {
  const KEY = "__roamHistoryAvailability";
  window[KEY]?.destroy?.();
  delete window[KEY];

  document
    .querySelectorAll(".rm-history-unavailable")
    .forEach((element) => element.classList.remove("rm-history-unavailable"));
})();
