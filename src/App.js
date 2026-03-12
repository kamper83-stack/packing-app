import React from "react";
import PackageApp from "./PackageApp";
import styled from "styled-components";

const AppWrapper = styled.div`
  text-align: center; 
  
`;

function App() {
  return (
    <AppWrapper>
      <PackageApp />
    </AppWrapper>
  );
}

export default App;
