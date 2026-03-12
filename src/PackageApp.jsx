import React from "react";
import Title from "./Title";
import styled from "styled-components";
import PackageList from "./PackageList";

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  min-height: 100vh;
  background-color: #f7f9fc;
`;


function PackageApp() {

  return (
    <AppContainer>
      <Title />
      <PackageList />
    </AppContainer>
  );
}

export default PackageApp;
