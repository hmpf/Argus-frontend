import React, { useEffect, useState, useMemo } from "react";

import { Link } from "react-router-dom";

import { makeStyles, Theme, createStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from "@material-ui/core/Tooltip";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import FilterListIcon from "@material-ui/icons/FilterList";
import CheckSharpIcon from "@material-ui/icons/CheckSharp";
import LinkSharpIcon from "@material-ui/icons/LinkSharp";
import OpenInNewIcon from "@material-ui/icons/OpenInNew";
import Paper from "@material-ui/core/Paper";
import Checkbox from "@material-ui/core/Checkbox";

import TicketIcon from "@material-ui/icons/LocalOffer";

import Typography from "@material-ui/core/Typography";

import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import MuiTable from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell, { TableCellProps } from "@material-ui/core/TableCell";
import TableContainer from "@material-ui/core/TableContainer";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";

import classNames from "classnames";

import {
  useStateWithDynamicDefault,
  toMap,
  pkGetter,
  truncateMultilineString,
  formatTimestamp,
  copyTextToClipboard,
} from "../../utils";

import { useAlertSnackbar, UseAlertSnackbarResultType } from "../../components/alertsnackbar";

import { Incident } from "../../api";
import { BACKEND_WS_URL } from "../../config";
import { useStyles } from "../incident/styles";
import { AckedItem, OpenItem } from "../incident/Chips";
import IncidentDetails from "../incident/IncidentDetails";

import { RealtimeService } from "../../services/RealtimeService";

import Modal from "../../components/modal/Modal";

const useToolbarStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1),
    },
    title: {
      flex: "1 1 100%",
    },
  }),
);

interface TableToolbarPropsType {
  selectedIncidents: Set<Incident["pk"]> | "SelectedAll";
  isLoading?: boolean;
}

/* TODO: Not implemented completely */
const TableToolbar: React.FC<TableToolbarPropsType> = ({ selectedIncidents, isLoading }: TableToolbarPropsType) => {
  const classes = useToolbarStyles();
  const rootClasses = useStyles();

  return (
    <Toolbar className={classes.root}>
      {selectedIncidents === "SelectedAll" || selectedIncidents.size > 0 ? (
        <Typography className={classes.title} color="inherit" variant="subtitle1" component="div">
          {selectedIncidents === "SelectedAll" ? "All" : selectedIncidents.size} selected
        </Typography>
      ) : (
        <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
          {(isLoading && "Loading incidents...") || "Incidents"}
        </Typography>
      )}

      {selectedIncidents === "SelectedAll" || selectedIncidents.size > 0 ? (
        <>
          <Tooltip title="Link">
            <IconButton aria-label="link" className={rootClasses.safeButton}>
              <LinkSharpIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Acknowledge" className={rootClasses.dangerousButton}>
            <IconButton aria-label="acknowledge">
              <CheckSharpIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close" className={rootClasses.dangerousButton}>
            <IconButton aria-label="close">
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Tooltip title="Filter list">
          <IconButton aria-label="filter list">
            <FilterListIcon />
          </IconButton>
        </Tooltip>
      )}
    </Toolbar>
  );
};

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

// TODO: refactor
type Order = "asc" | "desc";

function getComparator<T extends { [key: string]: number | string }>(
  order: Order,
  orderBy: keyof T,
): (a: T, b: T) => number {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort<T>(array: T[], comparator: (a: T, b: T) => number) {
  const stabilizedThis = array.map((el, index) => [el, index] as [T, number]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

type MUIIncidentTablePropsType = {
  incidents: Incident[];
  onShowDetail: (incide: Incident) => void;
  isLoading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginationComponent?: any;
};

const MUIIncidentTable: React.FC<MUIIncidentTablePropsType> = ({
  incidents,
  onShowDetail,
  isLoading,
  paginationComponent,
}: MUIIncidentTablePropsType) => {
  const style = useStyles();

  type SelectionState = "SelectedAll" | Set<Incident["pk"]>;
  const [selectedIncidents, setSelectedIncidents] = useState<SelectionState>(new Set<Incident["pk"]>([]));

  type IncidentOrderableFields = Pick<Incident, "start_time">;

  // TODO: implement proper ordering/sorting when support
  // for this is implemented in the backend.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [order, setOrder] = React.useState<Order>("desc");
  // TODO: fix typing problems here without use of any
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [orderBy, setOrderBy] = React.useState<keyof IncidentOrderableFields>("start_time");

  const handleRowClick = (event: React.MouseEvent<unknown>, incident: Incident) => {
    onShowDetail(incident);
  };

  const handleToggleSelectAll = () => {
    setSelectedIncidents((oldSelectedIncidents: SelectionState) => {
      if (oldSelectedIncidents === "SelectedAll") {
        return new Set<Incident["pk"]>([]);
      }
      return "SelectedAll";
    });
  };

  const handleSelectIncident = (incident: Incident) => {
    setSelectedIncidents((oldSelectedIncidents: SelectionState) => {
      if (oldSelectedIncidents === "SelectedAll") {
        const newSelected = new Set<Incident["pk"]>([...incidents.map((incident: Incident) => incident.pk)]);
        newSelected.delete(incident.pk);
        return newSelected;
      }
      const newSelectedIncidents = new Set<Incident["pk"]>(oldSelectedIncidents);
      if (oldSelectedIncidents.has(incident.pk)) {
        newSelectedIncidents.delete(incident.pk);
      } else {
        newSelectedIncidents.add(incident.pk);
      }
      return newSelectedIncidents;
    });
  };

  return (
    <Paper>
      {/* TODO: Not implemented yet */}
      {false && <TableToolbar isLoading={isLoading} selectedIncidents={selectedIncidents} />}
      <TableContainer component={Paper}>
        <MuiTable size="small" aria-label="incident table">
          <TableHead>
            <TableRow className={style.tableRow}>
              {/* TODO: Not implemented yet */}
              {false && (
                <TableCell padding="checkbox" onClick={() => handleToggleSelectAll()}>
                  <Checkbox disabled={isLoading} checked={selectedIncidents === "SelectedAll"} />
                </TableCell>
              )}
              <TableCell>Timestamp</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stableSort<Incident>(incidents, getComparator<IncidentOrderableFields>(order, orderBy))
              //.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((incident: Incident) => {
                const ClickableCell = (props: TableCellProps) => (
                  <TableCell onClick={(event) => handleRowClick(event, incident)} {...props} />
                );

                const isSelected = selectedIncidents === "SelectedAll" || selectedIncidents.has(incident.pk);

                return (
                  <TableRow
                    hover
                    key={incident.pk}
                    selected={isSelected}
                    style={{
                      cursor: "pointer",
                    }}
                    className={classNames(
                      style.tableRow,
                      incident.open
                        ? incident.acked
                          ? style.tableRowAcked
                          : style.tableRowOpenUnacked
                        : style.tableRowClosed,
                    )}
                  >
                    {/* TODO: Not implemented yet */}
                    {false && (
                      <TableCell padding="checkbox" onClick={() => handleSelectIncident(incident)}>
                        <Checkbox disabled={isLoading} checked={isSelected} />
                      </TableCell>
                    )}
                    <ClickableCell>{formatTimestamp(incident.start_time)}</ClickableCell>
                    <ClickableCell component="th" scope="row">
                      <OpenItem small open={incident.open} />
                      {/* <TicketItem small ticketUrl={incident.ticket_url} /> */}
                      <AckedItem small acked={incident.acked} />
                    </ClickableCell>
                    <ClickableCell>{incident.source.name}</ClickableCell>
                    <ClickableCell>{incident.description}</ClickableCell>
                    <TableCell>
                      <IconButton disabled={isLoading} component={Link} to={`/incidents/${incident.pk}/`}>
                        <OpenInNewIcon />
                      </IconButton>
                      {incident.ticket_url && (
                        <IconButton disabled={isLoading} href={incident.ticket_url}>
                          <TicketIcon />
                        </IconButton>
                      )}
                      {/* TODO: Not implementd yet */}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </MuiTable>
      </TableContainer>
      {paginationComponent}
    </Paper>
  );
};

type Revisioned<T> = T & { revision?: number };

type IncidentsProps = {
  incidents: Incident[];
  noDataText: string;
  realtime?: boolean;
  open?: boolean;
  isLoading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginationComponent?: any;
};

const IncidentTable: React.FC<IncidentsProps> = ({
  incidents,
  realtime,
  open,
  isLoading,
  paginationComponent,
}: IncidentsProps) => {
  const style = useStyles();

  const [incidentForDetail, setIncidentForDetail] = useState<Incident | undefined>(undefined);

  const incidentsDictFromProps = useMemo<Revisioned<Map<Incident["pk"], Incident>>>(
    () => toMap<Incident["pk"], Incident>(incidents, pkGetter),
    [incidents],
  );

  const [incidentsDict, setIncidentsDict] = useStateWithDynamicDefault<Revisioned<Map<Incident["pk"], Incident>>>(
    incidentsDictFromProps,
  );

  const [incidentsUpdated, setIncidentsUpdated] = useState<Revisioned<Incident[]>>(incidents);
  const { incidentSnackbar, displayAlertSnackbar }: UseAlertSnackbarResultType = useAlertSnackbar();

  useEffect(() => {
    // console.log("updating incidents");
    setIncidentsUpdated([...incidentsDict.values()]);
  }, [incidentsDict]);

  const handleShowDetail = (incident: Incident) => {
    setIncidentForDetail(incident);
  };

  const onModalClose = () => {
    setIncidentForDetail(undefined);
  };

  const handleIncidentChange = (incident: Incident, noDelete = false) => {
    console.log("handling change to incident", incident, "noDelete", noDelete);
    // TODO: handle acked/unacked changes as well because there is now
    // the showAcked variable in the "supercomponent" IncidentView that
    // passes the incidents to the incidentstable.
    // An alternative is to have a "filter" function that is passed to
    // this component from the composing component.
    setIncidentsDict((oldDict: Revisioned<Map<Incident["pk"], Incident>>) => {
      const newDict: typeof oldDict = new Map<Incident["pk"], Incident>(oldDict);
      const oldIncident = oldDict.get(incident.pk);
      if (!oldIncident || incident.open != oldIncident.open) {
        if (!incident.open && !noDelete) {
          // closed
          newDict.delete(incident.pk);
        } else {
          // opened (somehow), or nodelete
          newDict.set(incident.pk, incident);
        }
      } else {
        // updated in some other way
        newDict.set(incident.pk, incident);
      }
      newDict.revision = (newDict.revision || 1) + 1;
      //onsole.log("revision", newDict.revision);
      return newDict;
    });
    if (incidentForDetail && incidentForDetail.pk === incident.pk) setIncidentForDetail(incident);
  };

  // Wrapper for handleIncidentChange but that doesn't remove incidents from
  // the table until after a couple seconds, so that the user can see what changes
  // has been made more easily.
  const handleTimedIncidentChange = (incident: Incident) => {
    console.log("handling timed change to incident", incident);
    const oldIncident = incidentsDict.get(incident.pk);

    handleIncidentChange(incident, true);

    if (!oldIncident) return;

    setTimeout(() => {
      setIncidentsDict((oldDict: Revisioned<Map<Incident["pk"], Incident>>) => {
        const newDict: typeof oldDict = new Map<Incident["pk"], Incident>(oldDict);
        if (incident.open != open) {
          newDict.delete(incident.pk);
        } else {
          // updated in some other way
          newDict.set(incident.pk, incident);
        }
        newDict.revision = (newDict.revision || 1) + 1;
        //onsole.log("revision", newDict.revision);
        return newDict;
      });
    }, 5000);
  };

  // TODO: move this logic somewhere else
  useEffect(() => {
    const onIncidentAdded = (incident: Incident) => {
      if (open && !incident.open) {
        // TODO: how to handle this?
        return;
      }
      setIncidentsDict((oldDict: Revisioned<Map<Incident["pk"], Incident>>) => {
        const newDict: typeof oldDict = new Map<Incident["pk"], Incident>(oldDict);
        newDict.revision = (newDict.revision || 1) + 1;
        newDict.set(incident.pk, incident);
        return newDict;
      });
    };

    const onIncidentModified = (incident: Incident) => {
      handleTimedIncidentChange(incident);
    };

    const onIncidentRemoved = (incident: Incident) => {
      setIncidentsDict((oldDict: Revisioned<Map<Incident["pk"], Incident>>) => {
        const newDict: typeof oldDict = new Map<Incident["pk"], Incident>(oldDict);
        newDict.revision = (newDict.revision || 1) + 1;
        newDict.delete(incident.pk);
        return newDict;
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onIncidentsInitial = (incidents: Incident[]) => {
      // NOTE: Ignore this for now, because we automatically load
      // the top incidents we care about on table load. We only care
      // about new incidents, or changes to incidents atmm.
      // setIncidentsDict((oldDict: Revisioned<Map<Incident["pk"], Incident>>) => {
      //   const newDict: typeof oldDict = new Map<Incident["pk"], Incident>(oldDict);
      //   newDict.revision = (newDict.revision || 1) + 1;
      //   incidents.map((incident: Incident) => newDict.set(incident.pk, incident));
      //   return newDict;
      // });
    };

    const rts = new RealtimeService({
      onIncidentAdded,
      onIncidentModified,
      onIncidentRemoved,
      onIncidentsInitial,
    });
    rts.connect();
    console.log("created rts and connect()");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyCanonicalUrlToClipboard = () => {
    if (incidentForDetail) {
      const relativeUrl = `/incidents/${incidentForDetail.pk}/`;
      const canonicalUrl = `${window.location.protocol}//${window.location.host}${relativeUrl}`;
      copyTextToClipboard(canonicalUrl);
    }
  };

  return (
    <ClickAwayListener onClickAway={onModalClose}>
      <div>
        <Modal
          open={!!incidentForDetail}
          title={
            (incidentForDetail &&
              `${incidentForDetail.pk}: ${truncateMultilineString(incidentForDetail.description, 50)}`) ||
            ""
          }
          onClose={onModalClose}
          content={
            incidentForDetail && (
              <IncidentDetails
                key={incidentForDetail.pk}
                onIncidentChange={handleTimedIncidentChange}
                incident={incidentForDetail}
                displayAlertSnackbar={displayAlertSnackbar}
              />
            )
          }
          actions={
            <Button autoFocus onClick={copyCanonicalUrlToClipboard} color="primary">
              Copy URL
            </Button>
          }
          dialogProps={{ maxWidth: "lg", fullWidth: true }}
        />
        <MUIIncidentTable
          isLoading={isLoading}
          incidents={incidentsUpdated}
          onShowDetail={handleShowDetail}
          paginationComponent={paginationComponent}
        />
        {incidentSnackbar}
      </div>
    </ClickAwayListener>
  );
};

export default IncidentTable;
