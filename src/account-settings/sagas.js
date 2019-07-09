import { call, put, delay, takeEvery, select, all } from 'redux-saga/effects';

// Actions
import {
  FETCH_SETTINGS,
  fetchSettingsBegin,
  fetchSettingsSuccess,
  fetchSettingsFailure,
  closeForm,
  SAVE_SETTINGS,
  saveSettingsBegin,
  saveSettingsSuccess,
  saveSettingsFailure,
  savePreviousSiteLanguage,
  FETCH_TIME_ZONES,
  fetchTimeZones,
  fetchTimeZonesSuccess,
} from './actions';
import { usernameSelector, userRolesSelector, siteLanguageSelector } from './selectors';

// Sub-modules
import { saga as resetPasswordSaga } from './reset-password';
import { saga as siteLanguageSaga, ApiService as SiteLanguageApiService } from './site-language';
import { saga as thirdPartyAuthSaga } from './third-party-auth';

// Services
import * as ApiService from './service';

import { setLocale, handleRtl } from '@edx/frontend-i18n'; // eslint-disable-line

export function* handleFetchSettings() {
  try {
    yield put(fetchSettingsBegin());
    const username = yield select(usernameSelector);
    const userRoles = yield select(userRolesSelector);

    const {
      thirdPartyAuthProviders, profileDataManager, timeZones, ...values
    } = yield call(
      ApiService.getSettings,
      username,
      userRoles,
    );

    if (values.country) yield put(fetchTimeZones(values.country));

    yield put(fetchSettingsSuccess({
      values,
      thirdPartyAuthProviders,
      profileDataManager,
      timeZones,
    }));
  } catch (e) {
    yield put(fetchSettingsFailure(e.message));
    throw e;
  }
}

export function* handleSaveSettings(action) {
  try {
    yield put(saveSettingsBegin());

    const username = yield select(usernameSelector);
    const { commitValues, formId } = action.payload;
    const commitData = { [formId]: commitValues };
    let savedValues = null;
    if (formId === 'siteLanguage') {
      const previousSiteLanguage = yield select(siteLanguageSelector);
      yield all([
        call(SiteLanguageApiService.patchPreferences, username, { prefLang: commitValues }),
        call(SiteLanguageApiService.postSetLang, commitValues),
      ]);
      yield put(setLocale(commitValues));
      yield put(savePreviousSiteLanguage(previousSiteLanguage.savedValue));
      handleRtl();
      savedValues = commitData;
    } else {
      savedValues = yield call(ApiService.patchSettings, username, commitData);
    }
    yield put(saveSettingsSuccess(savedValues, commitData));
    if (savedValues.country) yield put(fetchTimeZones(savedValues.country));
    yield delay(1000);
    yield put(closeForm(action.payload.formId));
  } catch (e) {
    if (e.fieldErrors) {
      yield put(saveSettingsFailure({ fieldErrors: e.fieldErrors }));
    } else {
      yield put(saveSettingsFailure(e.message));
      throw e;
    }
  }
}

export function* handleFetchTimeZones(action) {
  const response = yield call(ApiService.getTimeZones, action.payload.country);
  yield put(fetchTimeZonesSuccess(response, action.payload.country));
}


export default function* saga() {
  yield takeEvery(FETCH_SETTINGS.BASE, handleFetchSettings);
  yield takeEvery(SAVE_SETTINGS.BASE, handleSaveSettings);
  yield takeEvery(FETCH_TIME_ZONES.BASE, handleFetchTimeZones);
  yield all([
    siteLanguageSaga(),
    resetPasswordSaga(),
    thirdPartyAuthSaga(),
  ]);
}
