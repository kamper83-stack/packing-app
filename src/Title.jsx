import React from 'react';
// import './Title.css'; //unused of using styled components

import styled from 'styled-components';
const TitleWrapper = styled.div
    `    
    text-align: center;
    color: #fff;
    background-color: #bf44d4ff;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;`;

function Title() {
    return (
        <TitleWrapper>
            <h1>PackageApp</h1>
            <p>Pack your things!</p>
        </TitleWrapper>
    );
}

export default Title;
