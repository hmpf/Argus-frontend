import React, { useContext } from "react";
import { Route, Redirect } from "react-router-dom";

import { Cookies } from "react-cookie";

// Api
import type { User } from "./api/types.d";
import api from "./api";
import auth from "./auth";

// Contexts/Hooks
import { AppContext } from "./state/contexts";
import { loginUser } from "./state/reducers/user";

type ProtectedRoutePropsType = {
  // Should be able to take all components, so any is probably acceptable here?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
  [key: string]: unknown;
};

export const ProtectedRoute: React.SFC<ProtectedRoutePropsType> = ({
  component: Component,
  ...rest
}: ProtectedRoutePropsType) => {
  const { dispatch } = useContext(AppContext);

  async function updateLoggedInState() {
    const cookies = new Cookies();
    const token = cookies.get("token");

    if (!auth.isAuthenticated() && token !== undefined) {
      auth.login(token, () => {
        api
          .authGetCurrentUser()
          .then((user: User) => {
            dispatch(loginUser(user));
          })
          .catch((error) => {
            console.log("error", error);
          });
      });
    } else {
    }
  }

  return (
    <Route
      {...rest}
      render={(props) => {
        updateLoggedInState();
        if (auth.isAuthenticated()) {
          return <Component {...props} />;
        } else {
          return (
            <Redirect
              to={{
                pathname: "/login",
                state: {
                  from: props.location,
                },
              }}
            />
          );
        }
      }}
    />
  );
};
