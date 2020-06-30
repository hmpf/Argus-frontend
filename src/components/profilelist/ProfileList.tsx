import React, { useState, useEffect } from "react";
import "./ProfileList.css";
import Profile from "../profile/Profile";
import Fab from "@material-ui/core/Fab";
import AddIcon from "@material-ui/icons/Add";

import ActionDialog from "../../components/actiondialog/ActionDialog";
import api, {
  defaultErrorHandler,
  NotificationProfile,
  NotificationProfilePK,
  NotificationProfileKeyed,
  Filter,
  FilterPK,
  Timeslot,
  TimeslotPK,
  MediaAlternative,
} from "../../api";
import { createUsePromise, useApiFilters } from "../../api/hooks";
import { debuglog, toMap, pkGetter, removeUndefined } from "../../utils";

// TODO: rename to components/alertsnackbar
import {
  useAlertSnackbar,
  UseAlertSnackbarResultType,
  AlertSnackbarState,
  AlertSnackbarSeverity,
} from "../../components/snackbar";

interface FilterData {
  label: string;
  value: string;
}

interface TimeslotData {
  label: string;
  value: string;
}

interface Data {
  label: string;
  value: string | number;
}

type Action = {
  message: string;
  success: boolean;
  completed: boolean;
};

const ProfileList: React.FC = () => {
  const [profiles, setProfiles] = useState<Map<NotificationProfilePK, NotificationProfile>>(
    new Map<NotificationProfilePK, NotificationProfile>(),
  );
  const [timeslots, setTimeslots] = useState<Map<TimeslotPK, Timeslot>>(new Map<TimeslotPK, Timeslot>());
  const [availableTimeslots, setAvailableTimeslots] = useState<Set<TimeslotPK>>(new Set<TimeslotPK>());

  const [action, setAction] = useState<Action>({ message: "", success: false, completed: false });

  const calculateAvailableTimeslots = (
    profiles: Map<NotificationProfilePK, NotificationProfile>,
    timeslots: Map<TimeslotPK, Timeslot>,
  ) => {
    const avail: Set<TimeslotPK> = new Set<TimeslotPK>([...timeslots.keys()]);
    for (const profile of profiles.values()) {
      avail.delete(profile.pk);
    }
    setAvailableTimeslots(avail);
  };

  type ProfilesTimeslots = {
    profiles: Map<NotificationProfilePK, NotificationProfile>;
    timeslots: Map<TimeslotPK, Timeslot>;
  };

  const mapper = ([profiles, timeslots]: [NotificationProfile[], Timeslot[]]): ProfilesTimeslots => {
    return {
      profiles: toMap<NotificationProfilePK, NotificationProfile>(profiles, pkGetter),
      timeslots: toMap<TimeslotPK, Timeslot>(timeslots, pkGetter),
    };
  };

  const useCombined = createUsePromise<[NotificationProfile[], Timeslot[]], ProfilesTimeslots>(mapper);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [alertSnackbar, alertSnackbarState, setAlertSnackbarState]: UseAlertSnackbarResultType = useAlertSnackbar();

  function displaySnackbar(message: string, severity?: AlertSnackbarSeverity) {
    debuglog(`Displaying message with severity ${severity}: ${message}`);
    setAlertSnackbarState((state: AlertSnackbarState) => {
      return { ...state, open: true, message, severity: severity || "success" };
    });
  }

  const [
    { result: combinedResult, isLoading: combinedIsLoading, isError: combinedIsError },
    setCombinedPromise,
  ] = useCombined();

  useEffect(() => {
    if (!combinedIsError) return;
    setAlertSnackbarState((state: AlertSnackbarState) => {
      return { ...state, open: true, message: "Unable to get profiles and timeslots", severity: "error" };
    });
  }, [combinedIsError, setAlertSnackbarState]);

  useEffect(() => {
    if (combinedResult === undefined) {
      return;
    }
    calculateAvailableTimeslots(combinedResult.profiles, combinedResult.timeslots);
    setProfiles(combinedResult.profiles || new Map<NotificationProfilePK, NotificationProfile>());
    setTimeslots(combinedResult.timeslots || new Map<TimeslotPK, Timeslot>());
  }, [combinedResult]);

  const [newProfile, setNewProfile] = useState<Partial<NotificationProfile> | undefined>(undefined);
  const [usedTimeslots, setUsedTimeslots] = useState<Set<Timeslot["name"]>>(new Set<Timeslot["name"]>());

  useEffect(() => {
    const newUsedTimeslots = new Set<Timeslot["name"]>(
      [...profiles.values()].map((profile: NotificationProfile) => profile.timeslot.name),
    );
    setUsedTimeslots(newUsedTimeslots);
  }, [profiles]);

  const [{ result: filters, isLoading: filtersIsLoading, isError: filtersIsError }, setFiltersPromise] = useApiFilters(
    () => undefined,
  )();

  useEffect(() => {
    if (!filtersIsError) return;
    setAlertSnackbarState((state: AlertSnackbarState) => {
      return { ...state, open: true, message: "Unable to filters", severity: "error" };
    });
  }, [filtersIsError, setAlertSnackbarState]);

  const mediaOptions: { label: string; value: MediaAlternative }[] = [
    { label: "Slack", value: "SL" },
    { label: "SMS", value: "SM" },
    { label: "Email", value: "EM" },
  ];

  useEffect(() => {
    setFiltersPromise(api.getAllFilters());
    const promise = Promise.all([api.getAllNotificationProfiles(), api.getAllTimeslots()]);
    setCombinedPromise(promise);
  }, [setFiltersPromise, setCombinedPromise]);

  const deleteSavedProfile = (pk: NotificationProfilePK) => {
    api
      .deleteNotificationProfile(pk)
      .then((success: boolean) => {
        setProfiles((profiles: Map<NotificationProfilePK, NotificationProfile>) => {
          const newProfiles = new Map<NotificationProfilePK, NotificationProfile>(profiles);
          newProfiles.delete(pk);
          return newProfiles;
        });
        const profileName = profiles.get(pk)?.timeslot.name || "<unknown>";
        displaySnackbar(
          success ? `Deleted notification profile: ${profileName}` : `Unable to delete profile: ${profileName}`,
          success ? "warning" : "error",
        );
      })
      .catch(defaultErrorHandler((msg: string) => displaySnackbar(msg, "error")));
  };

  const deleteNewProfile = () => {
    setNewProfile(undefined);
  };

  const updateSavedProfile = (profile: NotificationProfile) => {
    api
      .putNotificationProfile(
        profile.timeslot.pk,
        removeUndefined(profile.filters).map((filter: Filter): FilterPK => filter.pk),
        profile.media,
        profile.active,
      )
      .then((profile: NotificationProfile) => {
        setProfiles((profiles: Map<NotificationProfilePK, NotificationProfile>) => {
          const newProfiles = new Map<NotificationProfilePK, NotificationProfile>(profiles);
          newProfiles.set(profile.pk, profile);
          return newProfiles;
        });
        displaySnackbar(`Updated profile: ${profile.timeslot.name}`, "success");
      })
      .catch(defaultErrorHandler((msg: string) => displaySnackbar(msg, "error")));
  };

  const createNewProfile = (profile: Omit<NotificationProfileKeyed, "pk">) => {
    api
      .postNotificationProfile(profile.timeslot, profile.filters, profile.media, profile.active)
      .then((profile: NotificationProfile) => {
        setProfiles((profiles: Map<NotificationProfilePK, NotificationProfile>) => {
          const newProfiles = new Map<NotificationProfilePK, NotificationProfile>(profiles);
          newProfiles.set(profile.pk, profile);
          return newProfiles;
        });
        displaySnackbar(`Created new profile: ${profile.timeslot.name}`, "success");
      })
      .catch(defaultErrorHandler((msg: string) => displaySnackbar(msg, "error")));
    setNewProfile(undefined);
  };

  const addProfileClick = () => {
    if (availableTimeslots.size < 1 || !timeslots) {
      alert("All timeslots are in use");
    } else if (newProfile === undefined) {
      setNewProfile({ media: [], active: false, filters: [], timeslot: timeslots.values().next().value });
    } else {
      displaySnackbar("Already working on new filter. Create or delete that one first!", "error");
      return;
    }
  };

  const profilesKeys = [...((profiles && profiles.keys()) || [])];

  const newProfileComponent = newProfile ? (
    <Profile
      active={newProfile.active || false}
      filters={filters || new Map<FilterPK, Filter>()}
      timeslots={timeslots || new Map<TimeslotPK, Timeslot>()}
      mediums={mediaOptions}
      selectedMediums={newProfile?.media || []}
      selectedFilters={newProfile?.filters || []}
      selectedTimeslot={newProfile.timeslot}
      isTimeslotInUse={(timeslot: Timeslot) => usedTimeslots.has(timeslot.name)}
      onNewDelete={deleteNewProfile}
      onSavedDelete={deleteSavedProfile}
      onNewCreate={createNewProfile}
      onSavedUpdate={updateSavedProfile}
    />
  ) : (
    <></>
  );

  return (
    <>
      <div className="profile-container">
        {alertSnackbar}
        <ActionDialog
          key="actiondialog"
          message={action.message}
          show={action.completed}
          success={action.success}
          onClose={() => setAction((action: Action) => ({ ...action, completed: false }))}
        />
        {combinedIsLoading || filtersIsLoading ? (
          <h5>Loading...</h5>
        ) : profiles && profilesKeys.length > 0 ? (
          removeUndefined(
            profilesKeys.map((pk: NotificationProfilePK) => {
              const profile: NotificationProfile | undefined = profiles.get(pk);
              if (!profile) {
                return undefined;
              }

              return (
                <Profile
                  exists
                  active={profile.active}
                  filters={filters || new Map<FilterPK, Filter>()}
                  timeslots={timeslots || new Map<TimeslotPK, Timeslot>()}
                  isTimeslotInUse={(timeslot: Timeslot): boolean => usedTimeslots.has(timeslot.name)}
                  key={profile.pk}
                  pk={profile.pk}
                  mediums={mediaOptions}
                  selectedMediums={profile.media}
                  selectedFilters={profile.filters}
                  selectedTimeslot={profile.timeslot}
                  onNewDelete={deleteNewProfile}
                  onSavedDelete={deleteSavedProfile}
                  onNewCreate={createNewProfile}
                  onSavedUpdate={updateSavedProfile}
                />
              );
            }),
          )
        ) : newProfile ? (
          <></>
        ) : (
          <h5>No profiles</h5>
        )}
        {newProfileComponent}
        {!newProfile && (
          <div className="add-button">
            <Fab color="primary" aria-label="add" size="large" onClick={addProfileClick}>
              <AddIcon />
            </Fab>
          </div>
        )}
      </div>
    </>
  );
};

export default ProfileList;
